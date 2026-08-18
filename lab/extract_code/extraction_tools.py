import csv
import numpy as np
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
        perceptive_feature_extraction_model: ExtractionModel,
        fused_feature_extraction_model: ExtractionModel,
        save_dir="."
    ):
        self.shot_extraction_model = shot_extraction_model
        self.perceptive_feature_extraction_model = perceptive_feature_extraction_model
        self.fused_feature_extraction_model = fused_feature_extraction_model
        self.save_dir = Path(save_dir)
        self.img_dir = self.save_dir / "imgs"
        self.map_dir = self.save_dir / "maps"
        self.feat_siglip2_dense_dir = self.save_dir / "feats" / "siglip2_dense"
        self.feat_beit3_dense_dir = self.save_dir / "feats" / "beit3_dense"

        self.shot_extraction_model.load()
        self.perceptive_feature_extraction_model.load()
        self.fused_feature_extraction_model.load()


    def extract_keyframes_and_features(
        self,
        vid_path,
        confidence_threshold: float = 0.5,
        perceptive_feature_extraction_batch_size: int = 32,
        fused_feature_extraction_batch_size: int = 32
    ):
        imgs, maps = self.shot_extraction_model.run(vid_path, confidence_threshold)
        for map in maps: map["vid_path"] = vid_path
        
        feats_siglip2_dense = self.perceptive_feature_extraction_model.run(imgs, batch_size=perceptive_feature_extraction_batch_size)
        feats_beit3_dense = self.fused_feature_extraction_model.run(imgs, batch_size=fused_feature_extraction_batch_size)
        return imgs, maps, feats_siglip2_dense, feats_beit3_dense


    def filter_with_clustering(
        self,
        imgs: list,
        maps: list[dict],
        feats_siglip2_dense: np.ndarray,
        feats_beit3_dense: np.ndarray,
        clustering_similarity_threshold: float = 0.9
    ):
        similarity_matrix = cosine_similarity(feats_siglip2_dense)
        distance_matrix = np.clip(1 - similarity_matrix, 0, 1)

        distance_threshold = 1 - clustering_similarity_threshold
        clustering = AgglomerativeClustering(
            metric="precomputed",
            linkage="average",
            distance_threshold=distance_threshold,
            n_clusters=None
        )
        cluster_labels = clustering.fit_predict(distance_matrix)

        unique_imgs, unique_maps, unique_feats_siglip2_dense, unique_feats_beit3_dense = [], [], [], []
        n_clusters = len(np.unique(cluster_labels))

        for cluster_id in range(n_clusters):
            idxs = np.where(cluster_labels == cluster_id)[0]
            best_idx = idxs[0]

            if len(idxs) > 1:
                cluster_feats = feats_siglip2_dense[idxs]
                cluster_centroid = np.mean(cluster_feats, axis=0)
                centroid_similarities = cosine_similarity(cluster_feats, cluster_centroid.reshape(1, -1))
                best_idx = idxs[np.argmax(centroid_similarities)]

            unique_imgs.append(imgs[best_idx])
            unique_maps.append(maps[best_idx])
            unique_feats_siglip2_dense.append(feats_siglip2_dense[best_idx])
            unique_feats_beit3_dense.append(feats_beit3_dense[best_idx])

            # Re-index frame_id post-filtering
            for i in range(len(unique_maps)): unique_maps[i]["frame_id"] = f"{(i + 1):03d}"
        
        return unique_imgs, unique_maps, unique_feats_siglip2_dense, unique_feats_beit3_dense


    def save_images_and_features(self, imgs: list, maps: list[dict], feats_siglip2_dense: np.ndarray, feats_beit3_dense: np.ndarray):
        imgs = [img for img, _ in sorted(list(zip(imgs, maps)), key=lambda x: x[1]["frame_order"])]
        feats_siglip2_dense = [feat for feat, _ in sorted(list(zip(feats_siglip2_dense, maps)), key=lambda x: x[1]["frame_order"])]
        feats_beit3_dense = [feat for feat, _ in sorted(list(zip(feats_beit3_dense, maps)), key=lambda x: x[1]["frame_order"])]
        maps = sorted(maps, key=lambda x: x["frame_order"])

        csv_list = []
        header = []
        vid_id = ""
        for img, map, feat_siglip2_dense, feat_beit3_dense in zip(imgs, maps, feats_siglip2_dense, feats_beit3_dense):
            vid_id = Path(map["vid_path"]).stem
            frame_id = map["frame_id"]
            (self.img_dir / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_siglip2_dense_dir / vid_id).mkdir(parents=True, exist_ok=True)
            (self.feat_beit3_dense_dir / vid_id).mkdir(parents=True, exist_ok=True)

            img.save(self.img_dir / vid_id / f"{frame_id}.jpg")
            np.save(self.feat_siglip2_dense_dir / vid_id / f"{frame_id}.npy", feat_siglip2_dense)
            np.save(self.feat_beit3_dense_dir / vid_id / f"{frame_id}.npy", feat_beit3_dense)
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
        perceptive_feature_extraction_batch_size: int = 32,
        fused_feature_extraction_batch_size: int = 128,
        shot_confidence_threshold: float = 0.5,
        clustering_similarity_threshold: float = 0.9,
        max_workers: int = 1
    ):
        self.img_dir.mkdir(parents=True, exist_ok=True)
        self.map_dir.mkdir(parents=True, exist_ok=True)
        self.feat_siglip2_dense_dir.mkdir(parents=True, exist_ok=True)
        self.feat_beit3_dense_dir.mkdir(parents=True, exist_ok=True)

        def process_single_video(path):
            imgs, maps, feats_siglip2_dense, feats_beit3_dense = self.extract_keyframes_and_features(
                path,
                confidence_threshold=shot_confidence_threshold,
                perceptive_feature_extraction_batch_size=perceptive_feature_extraction_batch_size,
                fused_feature_extraction_batch_size=fused_feature_extraction_batch_size,
            )
            unique_imgs, unique_maps, unique_feats_siglip2_dense, unique_feats_beit3_dense = self.filter_with_clustering(
                imgs, maps, feats_siglip2_dense, feats_beit3_dense,
                clustering_similarity_threshold=clustering_similarity_threshold
            )
            self.save_images_and_features(unique_imgs, unique_maps, unique_feats_siglip2_dense, unique_feats_beit3_dense)

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
            if word['text'] and word['text'][-1] in [',', '.']:
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
                    frame_id = int(row["frame_id"])
                except Exception:
                    frame_id = idx + 1
                lower_bound = time_order - max_time_distance
                upper_bound = time_order + max_time_distance

                selected = [
                    sentence['text'] for sentence in tran_segments
                    if sentence['start_time'] >= lower_bound
                    and sentence['end_time'] <= upper_bound
                ]
                tran_map[f'{vid_id}_{frame_id:03d}'] = ' '.join(selected)

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
        for code, tran, feat_dense, feat_sparse, _ in zip(tran_map.keys(), tran_map.values(), *feats):
            vid_id, frame_id = code.rsplit('_', 1)
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