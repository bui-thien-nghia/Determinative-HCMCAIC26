import ipywidgets as widgets
import pandas as pd
import numpy as np
from db_management_tools import QueryManager
from pathlib import Path
from qdrant_client import models
from IPython.display import display

class NotebookDisplay:
    def __init__(self, cell_width, num_cols):
        self.cell_width = cell_width
        self.num_cols = num_cols


    def display(self, points: list[models.ScoredPoint], print_paths: bool = True):
        img_paths = [widgets.Image(value=open(point.payload["frame_path"], "rb").read(),
                                   format="jpg",
                                   width=self.cell_width)
                     for point in points]
        for i in range(0, len(img_paths), self.num_cols):
            if i + self.num_cols > len(img_paths):
                images = img_paths[i:len(img_paths)]
            else:
                images = img_paths[i:i+self.num_cols]

            row = widgets.HBox(images)
            display(row)
            if print_paths: print([f"{Path(point.payload["frame_path"]).parts[-2]}_{Path(point.payload['frame_path']).stem}"
                                   for point in points[i:i+self.num_cols]])


class Benchmarker:
    #TODO: Change tolerance unit to seconds instead of frame ids

    def __init__(self, query_manager: QueryManager):
        self.query_manager = query_manager


    def is_correct(
        self,
        candidate: models.ScoredPoint,
        ground_truth_vid_id: str,
        ground_truth_time_order: str | float,
        tolerance: float = 2
    ):
        try:
            if candidate.payload["vid_id"] != ground_truth_vid_id: return False
            return abs(float(candidate.payload["time_order"]) - float(ground_truth_time_order)) <= tolerance
        except Exception: return False


    def calculate_metrics(
        self,
        candidate_list: list[models.ScoredPoint],
        ground_truth_vid_id: str,
        ground_truth_time_order: str,
        k_list: list[int] = [1, 5, 10, 50],
        tolerance: float = 1,
    ):
        metrics = {f"Result@{k}": 0 for k in k_list}
        metrics["MRR"] = 0

        ranking = 0
        for i, candidate in enumerate(candidate_list):
            verdict = self.is_correct(candidate, ground_truth_vid_id, ground_truth_time_order, tolerance)
            if not verdict: continue
            ranking = i + 1
            break

        if not ranking: return metrics

        metrics["MRR"] = 1 / ranking
        for k in k_list: metrics[f"Result@{k}"] = ranking <= k
        return metrics


    def is_valid_test(self, task: str, queries: list[str], vid_id: str, time_orders: list[str | float]):
        return (task.lower() in ["kis", "qa", "trake"]
                and vid_id != ""
                and (len(queries) and len(time_orders))
                and len(queries) == len(time_orders))


    def parse_csv_question_bank(self, question_bank_path):
        bank = pd.read_csv(question_bank_path)
        test_questions = []
        for row in bank.itertuples():
            test_info = {
                "task": "",
                "queries": [],
                "answer_vid_id": "",
                "answer_time_orders": []
            }

            task = row.task
            vid_id = row.vid_id
            queries = row.query.split('|')
            time_orders = row.frame_ids.split('|')
            if self.is_valid_test(task, queries, vid_id, time_orders):
                test_info["task"] = task
                test_info["queries"] = queries
                test_info["answer_vid_id"] = vid_id
                test_info["answer_time_orders"] = time_orders

            test_questions.append(test_info)

        return test_questions


    def do_benchmark(
        self,
        collection_name: str,
        test_questions: list[dict] | str,
        test_settings: list[dict],
        tolerance: int = 2,
        save_record: bool = True
    ):
        if type(test_questions) == str:
            if ".csv" not in test_questions: raise ValueError("Question bank must be in CSV format.")
            test_questions = self.parse_csv_question_bank(test_questions)

        metrics = []
        all_records = [] # (test, setting, result)
        for test in test_questions:
            test_record = []
            vid_id = test["answer_vid_id"]
            for settings in test_settings:
                for query, time_order in zip(test["queries"], test["answer_time_orders"]):
                    if "use_aggregation" in settings:
                        settings.pop("use_aggregation")
                        points = self.query_manager.aggregated_search(
                            query,
                            collection_name=collection_name,
                            search_limit=50,
                            **settings
                        )
                    else:
                        points = self.query_manager.search(
                            query,
                            collection_name=collection_name,
                            search_limit=50,
                            **settings
                        )
                    result = self.calculate_metrics(points, vid_id, time_order, tolerance=tolerance)
                    metrics = list(result.keys())
                    result = list(result.values())
                    test_record.append(result)
            all_records.append(test_record)

        all_records = np.array(all_records)
        mean_records = np.mean(all_records, axis=0)

        df = pd.DataFrame(mean_records, columns=metrics, index=[f"Method {i + 1}" for i in range(mean_records.shape[0])])
        if save_record:
            df.to_csv("benchmark_result.csv")
        else:
            print("Benchmark results:")
            print(df.to_string())