import json
import pandas as pd
import numpy as np
import uuid
from pathlib import Path
from tqdm import tqdm
from qdrant_client import QdrantClient, models

class DataLoader:
    def __init__(self, dataset_dir: str, database_client_url="http://localhost:6333"):
        # Running setup
        self.dataset_dir = Path(dataset_dir)
        self.database_client = QdrantClient(url=database_client_url)

        # Schema
        self.feat_siglip2_dense_params = models.VectorParams(
            size=1152,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_beit3_dense_params = models.VectorParams(
            size=1024,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_bgem3_dense_params = models.VectorParams(
            size=1024,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_bgem3_sparse_params = models.SparseVectorParams(
            index=models.SparseIndexParams(on_disk=True),
            modifier=models.Modifier.IDF
        )
        self.db_hnsw_params = models.HnswConfigDiff(
            m=32,
            ef_construct=200,
            full_scan_threshold=10000
        )
        self.db_quantization_params = models.ScalarQuantization(
            scalar=models.ScalarQuantizationConfig(
                type=models.ScalarType.INT8,
                quantile=1.0,
                always_ram=True
            )
        )

        self.vid_paths = [str(path) for path in self.dataset_dir.rglob("vids/**/*.mp4")] # Videos
        self.map_paths = [str(path) for path in self.dataset_dir.rglob("maps/**/*.csv")] # Keyframe maps on videos
        self.met_paths = [str(path) for path in self.dataset_dir.rglob("mets/**/*.json")] # Metadata
        self.img_paths = [str(path) for path in self.dataset_dir.rglob("imgs/**/*.jpg")] # Keyframes
        self.tran_paths = [str(path) for path in self.dataset_dir.rglob("trans/**/*.txt")] # Transcriptions
        self.feat_siglip2_dense_paths = [str(path) for path in self.dataset_dir.rglob("feats/siglip2_dense/**/*.npy")]
        self.feat_beit3_dense_paths = [str(path) for path in self.dataset_dir.rglob("feats/beit3_dense/**/*.npy")]
        self.feat_bgem3_dense_paths = [str(path) for path in self.dataset_dir.rglob("feats/bgem3_dense/**/*.npy")]
        self.feat_bgem3_sparse_token_id_paths = [str(path) for path in self.dataset_dir.rglob("feats/bgem3_sparse/token_ids/**/*.npy")]
        self.feat_bgem3_sparse_weight_paths = [str(path) for path in self.dataset_dir.rglob("feats/bgem3_sparse/weights/**/*.npy")]

        print(f"""Dataset record:
{len(self.vid_paths)} videos
{len(self.map_paths)} keyframe maps
{len(self.met_paths)} metadata files
{len(self.img_paths)} keyframes
{len(self.tran_paths)} transcription chunks
{len(self.feat_siglip2_dense_paths)} SigLIP2 dense features
{len(self.feat_beit3_dense_paths)} BeIT3 dense features
{len(self.feat_bgem3_dense_paths)} BGE M3 dense features
{len(self.feat_bgem3_sparse_token_id_paths)} BGE M3 sparse token ids
{len(self.feat_bgem3_sparse_weight_paths)} BGE M3 sparse weights
""")


    def create_new_collection(self, collection_name: str):
        if self.database_client.collection_exists(collection_name=collection_name):
            confirm_deletion = input('The collection already existed, do you want to replace it (y/n)? ')
            if confirm_deletion.lower() == 'y':
                self.database_client.delete_collection(collection_name=collection_name)
                print('Deletion complete.')
            elif confirm_deletion.lower() == 'n':
                print('Deletion cancelled.')
                return
            else:
                print('Invalid input')
                return

        self.database_client.create_collection(
            collection_name=collection_name,
            vectors_config={
                'siglip2_dense': self.feat_siglip2_dense_params,
                'beit3_dense': self.feat_beit3_dense_params,
                'bgem3_dense': self.feat_bgem3_dense_params,
            },
            sparse_vectors_config={'bgem3_sparse': self.feat_bgem3_sparse_params},
            hnsw_config=self.db_hnsw_params,
            quantization_config=self.db_quantization_params
        )


    def list_collections(self):
        names = self.database_client.get_collections()
        print("Currently available collections:")
        for name in names: print(name)


    def delete_collection(self, collection_name):
        self.database_client.delete_collection(collection_name)
    

    def form_points(self, indices):
        points = []
        zipped = list(zip(
            self.img_paths,
            self.tran_paths,
            self.feat_siglip2_dense_paths,
            self.feat_beit3_dense_paths,
            self.feat_bgem3_dense_paths,
            self.feat_bgem3_sparse_token_id_paths,
            self.feat_bgem3_sparse_weight_paths
        ))
        if indices == []: indices = range(len(zipped))

        for i in indices:
            img, tran, feat_siglip2_dense, feat_beit3_dense, feat_bgem3_dense, feat_bgem3_sparse_token_id, feat_bgem3_sparse_weights = zipped[i]
            vid_id, frame_id = Path(img).parts[-2:]
            vid = [path for path in self.vid_paths if vid_id in path][0]
            img_map = [path for path in self.map_paths if vid_id in path][0]
            met = [path for path in self.met_paths if vid_id in path][0]

            # Convert them to ready-for-use
            img_map = pd.read_csv(img_map, skiprows=range(1, int(frame_id)), nrows=1).iloc[0].tolist()
            try:
                frame_order, time_order, fps = img_map
            except Exception:
                frame_order, time_order, fps = img_map[1:]
            with open(tran, 'r', encoding="utf-8") as f:
                tran = f.read()
            with open(met, 'r', encoding='utf-8') as f:
                met = json.load(f)
                yt_link = met["watch_url"] + f"&t={time_order}s"
            feat_siglip2_dense = np.load(feat_siglip2_dense).tolist()
            feat_beit3_dense = np.load(feat_beit3_dense).tolist()
            feat_bgem3_dense = np.load(feat_bgem3_dense).tolist()
            feat_bgem3_sparse_token_id = np.load(feat_bgem3_sparse_token_id).tolist()
            feat_bgem3_sparse_weights = np.load(feat_bgem3_sparse_weights).tolist()

            # Point format
            point = models.PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "siglip2_dense": feat_siglip2_dense,
                    "beit3_dense": feat_beit3_dense,
                    "bgem3_dense": feat_bgem3_dense,
                    "bgem3_sparse": models.SparseVector(
                        indices=feat_bgem3_sparse_token_id,
                        values=feat_bgem3_sparse_weights
                    )
                },
                payload={
                    "frame_path": img,
                    "vid_path": vid,
                    "frame_id": frame_id,
                    "vid_id": vid_id,
                    "frame_order": frame_order,
                    "time_order": time_order,
                    "fps": fps,
                    "yt_link": yt_link,
                    "transcript": tran
                }
            )
            points.append(point)

        return points


    def upsert_to_db(self, collection_name: str, batch_size: int = 256, num_workers: int = 1):
        points_count = len(self.img_paths)
        for i in tqdm(range(0, points_count, batch_size)):
            j = i + batch_size if i + batch_size < points_count else points_count
            points = self.form_points(range(i, j))
            self.database_client.upload_points(
                collection_name=collection_name,
                points=points,
                batch_size=batch_size,
                parallel=num_workers
            )


    def create_and_fill_database(
        self,
        collection_name: str,
        upload_batch_size: int = 256,
        upload_num_workers: int = 1
    ):
        self.create_new_collection(collection_name)
        self.upsert_to_db(
            collection_name,
            batch_size=upload_batch_size,
            num_workers=upload_num_workers
        )


class QueryManager:
    def __init__(self):
        pass


    def encode_query(self, query_type):
        pass


    def search(self, query): # Filter is implemented inside search as well
        pass


class PreferenceConfigurator:
    pass # For future work, after finishing basic database framework