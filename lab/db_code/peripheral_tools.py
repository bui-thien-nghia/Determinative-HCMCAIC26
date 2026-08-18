import ipywidgets as widgets
import pandas as pd
import numpy as np
import time
from db_management_tools import QueryManager
from tqdm import tqdm
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
        for k in k_list: metrics[f"Result@{k}"] = int(ranking <= k)
        return metrics


    def is_valid_test(self, task: str, queries: list[str], vid_id: str, time_orders: list[str | float]):
        return (task.lower() in ["kis", "qa", "trake"]
                and vid_id != ""
                and (len(queries) and len(time_orders))
                and len(queries) == len(time_orders))


    def parse_csv_question_bank(self, question_bank_path):
        bank = pd.read_csv(question_bank_path, dtype=str)
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
            time_orders = row.time_orders.split('|')
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
        tolerance: float = 2,
        save_record: bool = True
    ):
        if type(test_questions) == str:
            if ".csv" not in test_questions: raise ValueError("Question bank must be in CSV format.")
            test_questions = self.parse_csv_question_bank(test_questions)

        all_records = [] # (test, setting, result)
        for test in tqdm(test_questions, desc="Doing benchmark"):

            #! REMOVE THIS ON LARGE-SCALE TESTING
            if "L0" in test["answer_vid_id"] or "L1" in test["answer_vid_id"]: continue
            #!

            test_record = []
            vid_id = test["answer_vid_id"]
            for settings in test_settings:
                for query, time_order in zip(test["queries"], test["answer_time_orders"]):
                    if settings.get("use_aggregation", False):
                        agg_settings = settings.copy()
                        agg_settings.pop("use_aggregation")

                        timer_start = time.time()
                        points = self.query_manager.aggregated_search(
                            collection_name,
                            query,
                            search_limit=50,
                            **agg_settings
                        )
                        timer_end = time.time()
                    else:
                        timer_start = time.time()
                        points = self.query_manager.search(
                            collection_name,
                            query,
                            search_limit=50,
                            **settings
                        )
                        timer_end = time.time()

                    runtime = abs(timer_end - timer_start)
                    result = self.calculate_metrics(points, vid_id, time_order, tolerance=tolerance)
                    result["runtime"] = runtime

                    result = list(result.values())
                    test_record.append(result)
            all_records.append(test_record)

        all_records = np.array(all_records)
        mean_records = np.mean(all_records, axis=0)
        median_records = np.median(all_records, axis=0)
        min_records = np.min(all_records, axis=0)
        max_records = np.max(all_records, axis=0)
        std_records = np.std(all_records, axis=0)

        metrics = [
            "Result@1", "Result@5", "Result@10", "Result@50",
            "mean_MRR", "median_MRR", "min_MRR", "max_MRR", "std_MRR",
            "mean_Runtime", "median_Runtime", "min_Runtime", "max_Runtime", "std_Runtime",
        ]
        final_records = np.column_stack((
            mean_records[:,:-2],
            mean_records[:,-2], median_records[:,-2], min_records[:,-2], max_records[:,-2], std_records[:,-2],
            mean_records[:,-1], median_records[:,-1], min_records[:,-1], max_records[:,-1], std_records[:,-1],
        ))

        df = pd.DataFrame(final_records, columns=metrics, index=[f"Method {i + 1}" for i in range(final_records.shape[0])])
        if save_record:
            df.to_csv("benchmark_result.csv")
        else:
            print("Benchmark results:")
            print(df.to_string())


class BenchmarkerV2:

    def __init__(self, query_manager: QueryManager):
        self.query_manager = query_manager


    def is_correct(
        self,
        candidate: models.ScoredPoint,
        ground_truth_vid_id: str,
        ground_truth_time_start: str | float,
        ground_truth_time_end: str | float,
    ):
        try:
            if candidate.payload["vid_id"] != ground_truth_vid_id: return False
            return float(ground_truth_time_start) <= float(candidate.payload["time_order"]) <= float(ground_truth_time_end)
        except Exception: return False


    def calculate_metrics(
        self,
        candidate_list: list[models.ScoredPoint],
        ground_truth_vid_id: str,
        ground_truth_time_start: str,
        ground_truth_time_end: str,
        k_list: list[int] = [1, 5, 10, 50],
    ):
        metrics = {f"Result@{k}": 0 for k in k_list}
        metrics["MRR"] = 0

        ranking = 0
        for i, candidate in enumerate(candidate_list):
            verdict = self.is_correct(candidate, ground_truth_vid_id, ground_truth_time_start, ground_truth_time_end)
            if not verdict: continue
            ranking = i + 1
            break

        if not ranking: return metrics

        metrics["MRR"] = 1 / ranking
        for k in k_list: metrics[f"Result@{k}"] = int(ranking <= k)
        return metrics


    def is_valid_test(self, task: str, queries: list[str], vid_id: str, time_starts: list[str | float], time_ends: list[str | float]):
        return (task.lower() in ["kis", "qa", "trake"]
                and vid_id != ""
                and (len(queries) and len(time_starts) and len(time_ends))
                and len(queries) == len(time_starts) == len(time_ends))


    def parse_csv_question_bank(self, question_bank_path):
        bank = pd.read_csv(question_bank_path, dtype=str)
        test_questions = []
        for row in bank.itertuples():
            test_info = {
                "task": "",
                "queries": [],
                "answer_vid_id": "",
                "answer_time_starts": [],
                "answer_time_ends": []
            }

            task = row.task
            queries = row.query.split('|')
            vid_id = row.vid_id
            time_starts = row.time_starts.split('|')
            time_ends = row.time_ends.split('|')
            if self.is_valid_test(task, queries, vid_id, time_starts, time_ends):
                test_info["task"] = task
                test_info["queries"] = queries
                test_info["answer_vid_id"] = vid_id
                test_info["answer_time_starts"] = time_starts
                test_info["answer_time_ends"] = time_ends

            test_questions.append(test_info)

        return test_questions


    def do_benchmark(
        self,
        collection_name: str,
        test_questions: list[dict] | str,
        test_settings: list[dict],
        save_record: bool = True
    ):
        if type(test_questions) == str:
            if ".csv" not in test_questions: raise ValueError("Question bank must be in CSV format.")
            test_questions = self.parse_csv_question_bank(test_questions)

        all_records = [] # (test, setting, result)
        for test in tqdm(test_questions, desc="Doing benchmark"):

            test_record = []
            vid_id = test["answer_vid_id"]
            for settings in test_settings:
                for query, start, end in zip(test["queries"], test["answer_time_starts"], test["answer_time_ends"]):
                    if settings.get("use_aggregation", False):
                        agg_settings = settings.copy()
                        agg_settings.pop("use_aggregation")

                        timer_start = time.time()
                        points = self.query_manager.aggregated_search(
                            collection_name,
                            query,
                            search_limit=50,
                            **agg_settings
                        )
                        timer_end = time.time()
                    else:
                        timer_start = time.time()
                        points = self.query_manager.search(
                            collection_name,
                            query,
                            search_limit=50,
                            **settings
                        )
                        timer_end = time.time()

                    runtime = abs(timer_end - timer_start)
                    result = self.calculate_metrics(points, vid_id, start, end)
                    result["runtime"] = runtime

                    result = list(result.values())
                    test_record.append(result)
            all_records.append(test_record)

        all_records = np.array(all_records)
        mean_records = np.mean(all_records, axis=0)
        median_records = np.median(all_records, axis=0)
        min_records = np.min(all_records, axis=0)
        max_records = np.max(all_records, axis=0)
        std_records = np.std(all_records, axis=0)

        metrics = [
            "Result@1", "Result@5", "Result@10", "Result@50",
            "mean_MRR", "median_MRR", "min_MRR", "max_MRR", "std_MRR",
            "mean_Runtime", "median_Runtime", "min_Runtime", "max_Runtime", "std_Runtime",
        ]
        final_records = np.column_stack((
            mean_records[:,:-2],
            mean_records[:,-2], median_records[:,-2], min_records[:,-2], max_records[:,-2], std_records[:,-2],
            mean_records[:,-1], median_records[:,-1], min_records[:,-1], max_records[:,-1], std_records[:,-1],
        ))

        df = pd.DataFrame(final_records, columns=metrics, index=[f"Method {i + 1}" for i in range(final_records.shape[0])])
        if save_record:
            df.to_csv("benchmark_result.csv")
        else:
            print("Benchmark results:")
            print(df.to_string())