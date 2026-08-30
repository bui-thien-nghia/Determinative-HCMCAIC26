import csv
import json
import cv2
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
from models import *
from tqdm import tqdm

class KeyframeAndFeatureExtractor:
    def __init__(
        self,
        shot_extraction_model: ExtractionModel,
        feature_extraction_model: ExtractionModel,
        save_dir="."
    ):
        self.shot_extraction_model = shot_extraction_model
        self.feature_extraction_model = feature_extraction_model
        self.save_dir = Path(save_dir)
        self.img_dir = self.save_dir / "imgs"
        self.map_dir = self.save_dir / "maps"
        self.feat_dir = self.save_dir / "feats" / "siglip2_dense"

        self.shot_extraction_model.load()
        self.feature_extraction_model.load()


    def extract_keyframes_and_features(
        self,
        vid_path,
        confidence_threshold: float = 0.5,
        feature_extraction_batch_size: int = 32,
    ):
        # imgs, maps = self.shot_extraction_model.run(vid_path, confidence_threshold)
        # for map in maps: map["vid_path"] = vid_path

        imgs, maps = [], []
        cap = cv2.VideoCapture(vid_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(round(fps)) * 3

        # frame_order = 0
        # frame_id = 1
        # while True:
        #     ret, frame = cap.read()
        #     if not ret: break

        #     if not frame_order % frame_interval:
        #         imgs.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        #         maps.append({
        #             "vid_path": vid_path,
        #             "frame_id": f"{frame_id:03d}",
        #             "frame_order": frame_order + 1,
        #             "time_order": frame_order / fps,
        #             "fps": fps
        #         })
        #         frame_id += 1

        #     frame_order += 1

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        for frame_id, frame_order in enumerate(range(0, total_frames, frame_interval)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_order)
            ret, frame = cap.read()
            if not ret: break

            imgs.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            maps.append({
                "vid_path": vid_path,
                "frame_id": f"{(frame_id + 1):03d}",
                "frame_order": frame_order + 1,
                "time_order": frame_order / fps,
                "fps": fps
            })
        
        feats = self.feature_extraction_model.run(imgs, batch_size=feature_extraction_batch_size)
        return imgs, maps, feats


    def filter_with_clustering(
        self,
        imgs: list,
        maps: list[dict],
        feats: np.ndarray,
        clustering_similarity_threshold: float = 0.9
    ):
        similarity_matrix = cosine_similarity(feats)
        distance_matrix = np.clip(1 - similarity_matrix, 0, 1)

        distance_threshold = 1 - clustering_similarity_threshold
        clustering = AgglomerativeClustering(
            metric="precomputed",
            linkage="average",
            distance_threshold=distance_threshold,
            n_clusters=None
        )
        cluster_labels = clustering.fit_predict(distance_matrix)

        unique_imgs, unique_maps, unique_feats = [], [], []
        n_clusters = len(np.unique(cluster_labels))

        best_idxes = []
        for cluster_id in range(n_clusters):
            idxes = np.where(cluster_labels == cluster_id)[0]
            best_idx = idxes[0]

            if len(idxes) > 1:
                cluster_feats = feats[idxes]
                cluster_centroid = np.mean(cluster_feats, axis=0)
                centroid_similarities = cosine_similarity(cluster_feats, cluster_centroid.reshape(1, -1))
                best_idx = idxes[np.argmax(centroid_similarities)]

            best_idxes.append(best_idx)

        best_idxes = sorted(best_idxes)
        for i, best_idx in enumerate(best_idxes):
            unique_imgs.append(imgs[best_idx])
            unique_feats.append(feats[best_idx])

            new_map = maps[best_idx]
            new_map["frame_id"] = f"{(i + 1):03d}"
            unique_maps.append(maps[best_idx])

        return unique_imgs, unique_maps, unique_feats


    def save_images_and_features(
        self,
        imgs: list,
        maps: list[dict],
        feats: np.ndarray,
    ):
        csv_list = []
        header = []
        vid_id = ""
        for img, map, feat in zip(imgs, maps, feats):
            vid_id = Path(map["vid_path"]).stem
            frame_id = map["frame_id"]

            (self.img_dir / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_dir / vid_id).mkdir(parents=True, exist_ok=True)

            if isinstance(img, (list, np.ndarray)): img = Image.fromarray(img)
            img.save(self.img_dir / vid_id / f"{frame_id}.jpg")
            np.save(self.feat_dir / vid_id / f"{frame_id}.npy", feat)
            map.pop("vid_path", None)
            header = list(map.keys())
            csv_list.append(list(map.values()))

        with open(self.map_dir / f"{vid_id}.csv", 'w', newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(csv_list)


    def extract_and_save_keyframes(
        self,
        vid_paths: list[str],
        feature_extraction_batch_size: int = 32,
        shot_confidence_threshold: float = 0.5,
        clustering_similarity_threshold: float = 0.9,
        max_workers: int = 1
    ):
        self.img_dir.mkdir(parents=True, exist_ok=True)
        self.map_dir.mkdir(parents=True, exist_ok=True)
        self.feat_dir.mkdir(parents=True, exist_ok=True)

        def process_single_video(path):
            imgs, maps, feats = self.extract_keyframes_and_features(
                path,
                confidence_threshold=shot_confidence_threshold,
                feature_extraction_batch_size=feature_extraction_batch_size
            )
            unique_imgs, unique_maps, unique_feats = self.filter_with_clustering(
                imgs, maps, feats,
                clustering_similarity_threshold=clustering_similarity_threshold
            )
            self.save_images_and_features(unique_imgs, unique_maps, unique_feats)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for _ in tqdm(
                executor.map(process_single_video, vid_paths),
                total=len(vid_paths),
                desc="Extracting keyframes from video"
            ): pass


class TranscriptAndFeatureProcessor:
    def __init__(
        self,
        transcription_model: ExtractionModel,
        feature_extraction_model: ExtractionModel,
        save_dir="."
    ):
        self.transcription_model = transcription_model
        self.feature_extraction_model = feature_extraction_model
        self.save_dir = Path(save_dir)
        self.tran_dir = self.save_dir / "trans"
        self.feat_dir_dense = self.save_dir / "feats" / "bgem3_dense"
        self.feat_dir_sparse_token_ids = self.save_dir / "feats" / "bgem3_sparse" / "token_ids"
        self.feat_dir_sparse_weights = self.save_dir / "feats" / "bgem3_sparse" / "weights"

        self.transcription_model.load()
        self.feature_extraction_model.load()


    def transcribe_and_segment_transcript(
            self,
            vid_path: str,
            batch_size: int = 16,
            language: str = "",
            beam_size: int = 5,
            vad_filter: bool = True,
    ):
        tran_segments: list[dict] = []
        selected = []
        s, e = 0.0, 0.0
        tran_words = self.transcription_model.run(
            vid_path,
            batch_size=batch_size,
            language=language,
            beam_size=beam_size,
            vad_filter=vad_filter,
            word_timestamp=True
        )
        for word in tran_words:
            e = word['end_time']
            selected.append(word['text'])
            if word['text'] and word['text'][-1] in [',', '.', '?', '!', ';']:
                sentence = ' '.join(selected)
                tran_segments.append({'start_time': s, 'end_time': e, 'text': sentence})
                selected = []
                s = e
        if selected:
            sentence = ' '.join(selected)
            tran_segments.append({'start_time': s, 'end_time': e, 'text': sentence})

        return tran_segments


    def align_transcript_keyframe(
        self,
        tran_segments: list[dict],
        img_map_path: str,
        max_time_distance: float = 5.0
    ):
        tran_map: dict = {}
        vid_id = Path(img_map_path).stem
        with open(img_map_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for idx, row in enumerate(reader):
                time_order = float(row["time_order"])
                try:
                    frame_id = row["frame_id"]
                except Exception:
                    frame_id = f"{(idx + 1):03d}"
                lower_bound = time_order - max_time_distance
                upper_bound = time_order + max_time_distance

                selected = [
                    sentence['text'] for sentence in tran_segments
                    if sentence['start_time'] >= lower_bound
                    and sentence['end_time'] <= upper_bound
                ]
                tran_map[(vid_id, frame_id)] = ' '.join(selected)

        return tran_map


    def extract_transcription_features(
        self,
        tran_texts: list,
        batch_size: int = 32,
        return_dense: bool = False,
        return_sparse: bool = True,
        return_multi: bool = False,
    ):
        return [
            feat_type if feat_type is not None else [[] for _ in range(len(tran_texts))]
            for feat_type in self.feature_extraction_model.run(
            tran_texts,
            batch_size,
            return_dense=return_dense,
            return_sparse=return_sparse,
            return_multi=return_multi
        )]


    def save_transcripts_and_features(self, tran_map: dict, feats: list):
        vid_id = ""
        for (vid_id, frame_id), tran, feat_dense, feat_sparse, _ in zip(tran_map.keys(), tran_map.values(), *feats):
            (self.tran_dir / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_dir_dense / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_dir_sparse_token_ids / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_dir_sparse_weights / vid_id).mkdir(parents=True, exist_ok=True)

            feat_sparse_token_ids = np.array(list(feat_sparse.keys()), dtype=np.int32)
            feat_sparse_weights = np.array(list(feat_sparse.values()), dtype=np.float32)

            with open(self.tran_dir / vid_id / f"{frame_id}.txt", 'w', encoding="utf-8") as f:
                f.write(tran)
            np.save(self.feat_dir_dense / vid_id / f"{frame_id}.npy", feat_dense)
            np.save(self.feat_dir_sparse_token_ids / vid_id / f"{frame_id}.npy", feat_sparse_token_ids)
            np.save(self.feat_dir_sparse_weights / vid_id / f"{frame_id}.npy", feat_sparse_weights)


    def extract_and_save_transcript(self,
        vid_paths: list[str],
        map_paths: list[str],
        transcription_batch_size: int = 16,
        transcription_beam_size: int = 5,
        transcription_language: str = "",
        transcription_vad_filter: bool = True,
        alignment_max_time_distance: float = 5.0,
        feature_extraction_batch_size: int = 32,
        max_workers: int = 1
    ):
        self.tran_dir.mkdir(parents=True, exist_ok=True)
        self.feat_dir_dense.mkdir(parents=True, exist_ok=True)
        self.feat_dir_sparse_token_ids.mkdir(parents=True, exist_ok=True)
        self.feat_dir_sparse_weights.mkdir(parents=True, exist_ok=True)

        def process_single_video(vid: str, map: str):
            tran_segments = self.transcribe_and_segment_transcript(
                vid,
                batch_size=transcription_batch_size,
                language=transcription_language,
                beam_size=transcription_beam_size,
                vad_filter=transcription_vad_filter
            )
            tran_map = self.align_transcript_keyframe(
                tran_segments,
                img_map_path=map,
                max_time_distance=alignment_max_time_distance
            )
            feats = self.extract_transcription_features(
                list(tran_map.values()),
                batch_size=feature_extraction_batch_size,
                return_dense=True,
                return_sparse=True,
                return_multi=False
            )
            for feat in feats:
                for row in feat:
                    if np.nan in row: raise RuntimeError("Got NaN vector")
            self.save_transcripts_and_features(tran_map, feats)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for _ in tqdm(
                executor.map(process_single_video, vid_paths, map_paths),
                total=len(vid_paths),
                desc="Extracting transcripts from video"
            ): pass


class FeaturePackager:
    def __init__(self, feats_dir, save_dir):
        self.feats_dir = Path(feats_dir)
        self.save_dir = Path(save_dir)


    def compact_and_save_features(self, max_workers: int = 1):
        feats_siglip2_dense_paths = [str(path) for path in self.feats_dir.rglob("siglip2_dense/**/*.npy")]
        feats_beit3_dense_paths = [str(path) for path in self.feats_dir.rglob("beit3_dense/**/*.npy")]
        feats_bgem3_dense_paths = [str(path) for path in self.feats_dir.rglob("bgem3_dense/**/*.npy")]
        feats_bgem3_sparse_token_ids_paths = [str(path) for path in self.feats_dir.rglob("bgem3_sparse/token_ids/**/*.npy")]
        feats_bgem3_sparse_weights_paths = [str(path) for path in self.feats_dir.rglob("bgem3_sparse/weights/**/*.npy")]

        all_ls_len = [
            len(feats_siglip2_dense_paths),
            len(feats_beit3_dense_paths),
            len(feats_bgem3_dense_paths),
            len(feats_bgem3_sparse_token_ids_paths),
            len(feats_bgem3_sparse_weights_paths)
        ]

        if len(set(all_ls_len)) != 1:
            print(f"Lists' lengths mismatched. Compaction cancelled. Lengths of all lists are: {all_ls_len}")

        def load_and_save_single_npz(            
            feat_siglip2_dense_path,
            feat_beit3_dense_path,
            feat_bgem3_dense_path,
            feat_bgem3_sparse_token_ids_path,
            feat_bgem3_sparse_weights_path
        ):
            vid_id = Path(feat_siglip2_dense_path).parts[-2]
            frame_id = Path(feat_siglip2_dense_path).stem
            Path(self.save_dir / vid_id).mkdir(parents=True, exist_ok=True)
            np.savez(
                str(Path(self.save_dir / vid_id / f"{frame_id}.npz")),
                feat_siglip2_dense=np.load(feat_siglip2_dense_path),
                feat_beit3_dense=np.load(feat_beit3_dense_path),
                feat_bgem3_dense=np.load(feat_bgem3_dense_path),
                feat_bgem3_sparse_token_ids=np.load(feat_bgem3_sparse_token_ids_path),
                feat_bgem3_sparse_weights=np.load(feat_bgem3_sparse_weights_path),
            )

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for _ in tqdm(
                executor.map(
                    load_and_save_single_npz,
                    feats_siglip2_dense_paths,
                    feats_beit3_dense_paths,
                    feats_bgem3_dense_paths,
                    feats_bgem3_sparse_token_ids_paths,
                    feats_bgem3_sparse_weights_paths
                ),
                total=len(feats_siglip2_dense_paths),
                desc="Compacting features"
            ): pass


class InfoPackager:
    def __init__(self, map_dir, save_dir):
        self.map_dir = Path(map_dir)
        self.save_dir = Path(save_dir)
        self.maps = {}
        self.load_maps()


    def load_maps(self):
        map_paths = self.map_dir.rglob("**/*.csv")
        for path in tqdm(list(map_paths), desc="Loading maps"):
            vid_id = path.stem
            if vid_id not in self.maps: self.maps[vid_id] = {}
            map = pd.read_csv(path).to_dict(orient="records")
            for frame_info in map:
                frame_info["vid_id"] = vid_id
                frame_id = f"{frame_info["frame_id"]:03d}"
                frame_info["frame_id"] = frame_id
                self.maps[vid_id][frame_id] = frame_info

    def form_key_value_dict(self, path: Path, keys_and_column_names: list[tuple[str, str]] = []):
        info_dict = {}
        tmp = None
        match path.suffix:
            case ".txt":
                if len(keys_and_column_names) > 1:
                    print(".txt file cannot be processed with 2 or more keys. If you want to, preprocess the .txt files first.")
                    pass
                with open(path, "r", encoding="utf-8") as f:
                    tmp = f.read()
                info_dict[keys_and_column_names[0][1]] = tmp
            case ".json":
                with open(path, "r", encoding="utf-8") as f:
                    tmp = json.load(f)
                for key, column_name in keys_and_column_names:
                    info_dict[column_name] = tmp[key]
            case ".csv":
                tmp = pd.read_csv(path, usecols=[pair[1] for pair in keys_and_column_names]).to_dict(orient="records")
                pass # Not used for now

        return info_dict

    def add_info_to_map(
        self,
        scope: str,
        info_dir: str | Path,
        keys_and_column_names: list[tuple[str, str]] = [],
        max_workers: int = 1
    ):
        if not len(keys_and_column_names): return
        if scope not in ["video", "frame"]:
            print("Scope must be either \"video\" or \"frame\".")
            return

        info_dir = Path(info_dir)
        info_paths = [path for path in list(info_dir.rglob('*')) if path.is_file()]
        if not len(info_paths): return

        def add_single_file(path: Path):
            info_dict = self.form_key_value_dict(path, keys_and_column_names)
            if scope == "frame":
                vid_id, frame_id = path.parts[-2], path.stem
                self.maps[vid_id][frame_id].update(info_dict)
            else:
                vid_id = path.stem
                for infos in self.maps[vid_id].values(): infos.update(info_dict)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for _ in tqdm(
                executor.map(
                    add_single_file,
                    info_paths
                ),
                total=len(info_paths),
                desc="Adding data"
            ): pass


    def save_map(self):
        self.save_dir.mkdir(parents=True, exist_ok=True)
        for vid_id, frame_info in tqdm(self.maps.items(), total=len(self.maps), desc="Saving maps"):
            pd.DataFrame(frame_info.values()).to_csv(self.save_dir / f"{vid_id}.csv", index=False)