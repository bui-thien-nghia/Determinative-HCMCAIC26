import os
import csv
import numpy as np
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity

# Import all models
from models import *

class KeyframeAndFeatureExtractor:
    def __init__(
        self,
        shot_extraction_model: ExtractionModel,
        feature_extraction_model: ExtractionModel,
        save_dir="."
    ):
        self.shot_extraction_model = shot_extraction_model
        self.feature_extraction_model = feature_extraction_model
        self.img_dir = os.path.join(save_dir, "imgs")
        self.map_dir = os.path.join(save_dir, "maps")
        self.feat_dir = os.path.join(save_dir, "feats", "siglip2_dense")

        self.shot_extraction_model.load()
        self.feature_extraction_model.load()


    def extract_keyframes_and_features(
        self,
        vid_path,
        confidence_threshold: float = 0.5,
        feature_extraction_batch_size: int = 32
    ):
        imgs, maps = self.shot_extraction_model.run(vid_path, confidence_threshold)
        for map in maps: map["vid_path"] = vid_path
        
        feats = self.feature_extraction_model.run(imgs, batch_size=feature_extraction_batch_size)
        return imgs, maps, feats


    def filter_with_clustering(self, imgs: list, maps: list[dict], feats: np.ndarray, clustering_similarity_threshold: float = 0.85):
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

        for cluster_id in range(n_clusters):
            idxs = np.where(cluster_labels == cluster_id)[0]
            best_idx = idxs[0]

            if len(idxs) > 1:
                cluster_feats = feats[idxs]
                cluster_centroid = np.mean(cluster_feats, axis=0)
                centroid_similarities = cosine_similarity(cluster_feats, cluster_centroid.reshape(1, -1))
                best_idx = idxs[np.argmax(centroid_similarities)]

            unique_imgs.append(imgs[best_idx])
            unique_maps.append(maps[best_idx])
            unique_feats.append(feats[best_idx])
        
        return unique_imgs, unique_maps, unique_feats


    def save_images_and_features(self, imgs: list, maps: list[dict], feats: np.ndarray):
        imgs = [img for img, _ in sorted(list(zip(imgs, maps)), key=lambda x: x[1]["frame_order"])]
        feats = [feat for feat, _ in sorted(list(zip(feats, maps)), key=lambda x: x[1]["frame_order"])]
        maps = sorted(maps, key=lambda x: x["frame_order"])

        csv_list = []
        header = []
        vid_id = ""
        for idx, (img, map, feat) in enumerate(zip(imgs, maps, feats)):
            vid_id = map["vid_path"].split('\\')[-1].split('.')[0]
            frame_id = f"{(idx + 1):03d}"
            os.makedirs(os.path.join(self.img_dir, vid_id), exist_ok=True)
            os.makedirs(os.path.join(self.feat_dir, vid_id), exist_ok=True)

            img.save(os.path.join(self.img_dir, vid_id, f"{frame_id}.jpg"))
            np.save(os.path.join(self.feat_dir, vid_id, f"{frame_id}.npy"), feat)
            map.pop("vid_path", None)
            header = list(map.keys())
            csv_list.append(list(map.values()))

        with open(os.path.join(self.map_dir, f"{vid_id}.csv"), 'w', newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(csv_list)


    def extract_and_save_keyframes(
        self,
        vid_paths: list[str],
        feature_extraction_batch_size: int = 32,
        shot_confidence_threshold: float = 0.5,
        clustering_similarity_threshold: float = 0.85,
        max_workers: int = 1
    ):
        os.makedirs(self.img_dir, exist_ok=True)
        os.makedirs(self.map_dir, exist_ok=True)
        os.makedirs(self.feat_dir, exist_ok=True)

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


class AudioProcessor:
    pass