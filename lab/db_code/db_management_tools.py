import json
import pandas as pd
import numpy as np
import uuid
from pathlib import Path
from qdrant_client import QdrantClient, models
from models import *
from tqdm import tqdm

class DataLoader:
    def __init__(self, dataset_dir: str, database_client_url: str = "http://localhost:6334", vid_dir: str = "vids"):
        # Running setup
        self.dataset_dir = Path(dataset_dir)
        self.database_client = QdrantClient(url=database_client_url, prefer_grpc=True)

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
        self.payload_schema = [ # Only index payloads for filtering
            {
                "field_name": "frame_id",
                "field_schema": models.KeywordIndexParams(
                    type=models.KeywordIndexType.KEYWORD,
                    prefix=True,
                )
            },
            {
                "field_name": "vid_id",
                "field_schema": models.KeywordIndexParams(
                    type=models.KeywordIndexType.KEYWORD,
                    is_tenant=True,
                    prefix=True
                )
            },
            {
                "field_name": "frame_order",
                "field_schema": models.IntegerIndexParams(
                    type=models.IntegerIndexType.INTEGER,
                    is_principal=True,
                    lookup=True,
                    range=False
                ),
            },
            {
                "field_name": "time_order",
                "field_schema": models.FloatIndexParams(
                    type=models.FloatIndexType.FLOAT,
                    is_principal=True,
                )
            },
            {
                "field_name": "transcript",
                "field_schema": models.TextIndexParams(
                    type=models.TextIndexType.TEXT,
                    tokenizer=models.TokenizerType.MULTILINGUAL,
                    min_token_len=2,
                    max_token_len=20,
                    lowercase=True,
                    phrase_matching=True
                )
            }
        ]

        self.map_paths_map = {path.stem: str(path) for path in self.dataset_dir.rglob("maps/**/*.csv")} # Maps
        self.img_paths = [str(path) for path in self.dataset_dir.rglob("imgs/**/*.jpg")] # Keyframes
        self.frame_info_map = {}
        self.build_frame_info_map(vid_dir)

        print(f"""Dataset record:
{len(self.map_paths_map)} videos
{len(self.img_paths)} keyframes
""")


    def build_frame_info_map(self, vid_dir: str = "vids"):
        for vid_id in self.map_paths_map.keys():
            met_path = self.dataset_dir / "mets" / f"{vid_id}.json"
            map_path = self.dataset_dir / "maps" / f"{vid_id}.csv"
            vid_path = str(Path(vid_dir) / f"{vid_id}.mp4")

            map = pd.read_csv(map_path)
            with open(met_path, 'r', encoding='utf-8') as f:
                met = json.load(f)
                base_yt_link = met["watch_url"]
            for row in map.to_dict(orient="records"):
                frame_id = f"{row["frame_id"]:03d}"
                frame_order = int(row["frame_order"])
                time_order = float(row["time_order"])
                fps = float(row["fps"])
                yt_link = base_yt_link + f"&t={time_order}s"

                self.frame_info_map[(vid_id, frame_id)] = {
                    "frame_order": frame_order,
                    "time_order": time_order,
                    "fps": fps,
                    "vid_path": vid_path,
                    "yt_link": yt_link
                }


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
        for schema in self.payload_schema:
            self.database_client.create_payload_index(
                collection_name,
                **schema
            )


    def list_collections(self):
        names = self.database_client.get_collections()
        print("Currently available collections:")
        for name in names: print(name)


    def delete_collection(self, collection_name):
        self.database_client.delete_collection(collection_name)


    def points_generator(self):
        for frame_path in self.img_paths:
            vid_id = Path(frame_path).parts[-2]
            frame_id = Path(frame_path).stem

            tran_path = self.dataset_dir / "trans" / vid_id / f"{frame_id}.txt"
            feat_siglip2_dense_path = self.dataset_dir / "feats" / "siglip2_dense" / vid_id / f"{frame_id}.npy"
            feat_beit3_dense_path = self.dataset_dir / "feats" / "beit3_dense" / vid_id / f"{frame_id}.npy"
            feat_bgem3_dense_path = self.dataset_dir / "feats" / "bgem3_dense" / vid_id / f"{frame_id}.npy"
            feat_bgem3_sparse_token_ids_path = self.dataset_dir / "feats" / "bgem3_sparse" / "token_ids" / vid_id / f"{frame_id}.npy"
            feat_bgem3_sparse_weights_path = self.dataset_dir / "feats" / "bgem3_sparse" / "weights" / vid_id / f"{frame_id}.npy"

            # Fetch unloaded data
            with open(tran_path, 'r', encoding="utf-8") as f:
                tran = f.read()
            feat_siglip2_dense = np.load(feat_siglip2_dense_path).tolist()
            feat_beit3_dense = np.load(feat_beit3_dense_path).tolist()
            feat_bgem3_dense = np.load(feat_bgem3_dense_path).tolist()
            feat_bgem3_sparse_token_ids = np.load(feat_bgem3_sparse_token_ids_path).tolist()
            feat_bgem3_sparse_weights = np.load(feat_bgem3_sparse_weights_path).tolist()

            # Point format
            yield models.PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "siglip2_dense": feat_siglip2_dense,
                    "beit3_dense": feat_beit3_dense,
                    "bgem3_dense": feat_bgem3_dense,
                    "bgem3_sparse": models.SparseVector(
                        indices=feat_bgem3_sparse_token_ids,
                        values=feat_bgem3_sparse_weights
                    )
                },
                payload={
                    "frame_path": frame_path,
                    "frame_id": frame_id,
                    "vid_id": vid_id,
                    "transcript": tran,
                    **self.frame_info_map[(vid_id, frame_id)]
                }
            )


    def upsert_to_db(self, collection_name: str, batch_size: int = 256, num_workers: int = 1):
        self.database_client.upload_points(
            collection_name=collection_name,
            points=tqdm(self.points_generator(), total=len(self.img_paths), desc="Uploading dataset to Qdrant"),
            batch_size=batch_size,
            parallel=num_workers,
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
    def __init__(
        self,
        image_text_feature_extractor: ExtractionModel,
        text_text_feature_extractor: ExtractionModel,
        database_client_url="http://localhost:6333"
    ):
        # Running setup
        self.database_client = QdrantClient(url=database_client_url)
        self.image_text_feature_extractor = image_text_feature_extractor
        self.text_text_feature_extractor = text_text_feature_extractor

        self.search_params = models.SearchParams(
            hnsw_ef=200,
            quantization=models.QuantizationSearchParams(
                rescore=True,
                oversampling=2.0
            )
        )

        self.image_text_feature_extractor.load()
        self.text_text_feature_extractor.load()


    def list_collections(self):
        collections = self.database_client.get_collections().collections
        print("Currently available collections:")
        return [collection.name for collection in collections]


    def describe_schema(self, collection_name: str):
        indexed_fields = list(self.database_client.get_collection(collection_name).payload_schema.keys())
        example_point, _ = self.database_client.scroll(
            collection_name,
            limit=1,
        )
        schema_descriptor = {
            key: {
                "data_type": type(value).__name__,
                "is_indexed": False
            }
            for key, value in example_point[0].payload.items()
        }
        for field in indexed_fields: schema_descriptor[field]["is_indexed"] = True
        return schema_descriptor


    def encode_query(self, query: str, return_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"]):
        feat_query: dict[str, list | models.SparseVector | None] = {vect: None for vect in return_vectors}
        if "siglip2_dense" in return_vectors: feat_query["siglip2_dense"] = self.image_text_feature_extractor.run([query], 1).flatten().tolist()
        if "bgem3_dense" in return_vectors or "bgem3_sparse" in return_vectors:
            feat_bgem3_dense, feat_bgem3_sparse, _ = self.text_text_feature_extractor.run([query], 1)
            if "bgem3_dense" in return_vectors: feat_query["bgem3_dense"] = feat_bgem3_dense[0].flatten().tolist()
            if "bgem3_sparse" in return_vectors: feat_query["bgem3_sparse"] = models.SparseVector(
                indices=np.array(list(feat_bgem3_sparse[0].keys()), dtype=np.int32).tolist(),
                values=np.array(list(feat_bgem3_sparse[0].values()), dtype=np.float32).tolist(),
            )

        return feat_query


    def cosine_similarity(self, vect_a: list, vect_b: list):
        np_vect_a = np.array(vect_a)
        np_vect_b = np.array(vect_b)
        return float(np.dot(np_vect_a, np_vect_b)) # Variant for all vectors normalized


    def sparse_similarity(self, ids_a: list, weights_a: list, ids_b: list, weights_b: list):
        vect_a = {id: weight for id, weight in zip(ids_a, weights_a)}
        vect_b = {id: weight for id, weight in zip(ids_b, weights_b)}
        common_ids = set(vect_a.keys()).intersection(vect_b.keys())
        return float(sum(vect_a[id] * vect_b[id] for id in common_ids))


    def create_prefetch(
        self,
        siglip2_dense = None,
        bgem3_dense = None,
        bgem3_sparse = None,
        search_limit: int = 100
    ):
        prefetch = []
        if siglip2_dense:
            prefetch.append(models.Prefetch(
                query=siglip2_dense,
                using="siglip2_dense",
                limit=search_limit
            ))
        if bgem3_dense:
            prefetch.append(models.Prefetch(
                query=bgem3_dense,
                using="bgem3_dense",
                limit=search_limit
            ))
        if bgem3_sparse:
            prefetch.append(models.Prefetch(
                query=bgem3_sparse,
                using="bgem3_sparse",
                limit=search_limit
            ))
        return prefetch


    def create_filter(self, key: str, value):
        return models.FieldCondition(
            key=key,
            match=models.MatchText(text=value)
        )


    def create_filters(self, **kwargs):
        return [self.create_filter(key, value) for key, value in kwargs.items() if value]


    def get_points(
        self,
        collection_name: str,
        filters: list[models.Condition] = [],
        pagination_limit: int = 1000,
        with_payload: bool | list[str] = True,
        with_vectors: bool | list[str] = False
    ):
        offset = None
        points = []

        while True:
            records, offset = self.database_client.scroll(
                collection_name,
                scroll_filter=models.Filter(must=filters),
                offset=offset,
                limit=pagination_limit,
                with_payload=with_payload,
                with_vectors=with_vectors
            )
            points.extend(records)
            
            if offset is None:
                break

        return points


    def search(
        self,
        collection_name: str,
        query: str | list[models.Prefetch],
        search_limit: int = 100,
        using_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
        return_vectors: list[str] | bool = False,
        return_payloads: list[str] | bool = True,
        filter: list[models.Condition] = []
    ):
        if not using_vectors:
            raise ValueError("Cannot search without vector")

        if isinstance(query, str):
            feat_query = self.encode_query(query, return_vectors=using_vectors)
            prefetch = self.create_prefetch(**feat_query, search_limit=search_limit)
        else:
            prefetch = query

        points = self.database_client.query_points(
            collection_name,
            prefetch=prefetch,
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            with_vectors=return_vectors,
            with_payload=return_payloads,
            query_filter=models.Filter(must=filter),
            limit=search_limit,
            search_params=self.search_params
        ).points
        return points


    def batch_search(
        self,
        collection_name: str,
        queries: list[str | list[models.Prefetch] | models.QueryRequest],
        search_limit: int = 100,
        using_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
        return_vectors: list[str] | bool = False,
        return_payloads: list[str] | bool = True,
        filter: list[models.Condition] = []
    ):
        if not using_vectors:
            raise ValueError("Cannot search without vector")

        for i in range(len(queries)):
            if not isinstance(queries[i], models.QueryRequest):
                if isinstance(queries[i], str):
                    feat_query = self.encode_query(queries[i], return_vectors=using_vectors)
                    prefetch = self.create_prefetch(**feat_query, search_limit=search_limit)
                    queries[i] = prefetch

                queries[i] = models.QueryRequest(
                    prefetch=queries[i],
                    query=models.FusionQuery(fusion=models.Fusion.RRF),
                    filter=models.Filter(must=filter),
                    params=self.search_params,
                    limit=search_limit,
                    with_vector=return_vectors,
                    with_payload=return_payloads,
                )

        results = self.database_client.query_batch_points(
            collection_name,
            requests=queries,
        )
        points = [res.points for res in results]
        return points


    def aggregated_search(
        self,
        collection_name: str,
        query: str,
        search_limit: int = 100,
        aggregation_neighbor_limit: int = 10,
        aggregation_weight: float = 0.5,
        temporal_evaluation_weights: list[float] = [0.6, 0.2, 0.2]
    ):
        # Safeguard
        aggregation_neighbor_limit = np.clip(aggregation_neighbor_limit, 0, search_limit)
        aggregation_weight = np.clip(aggregation_weight, 0, 1)

        # Initial list
        feat_query = self.encode_query(query)
        query_prefetch = self.create_prefetch(
            siglip2_dense=feat_query["siglip2_dense"],
            bgem3_dense=feat_query["bgem3_dense"],
            bgem3_sparse=feat_query["bgem3_sparse"],
            search_limit=search_limit
        )
        points = self.search(
            collection_name,
            query=query_prefetch,
            search_limit=search_limit,
            return_vectors=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
            return_payloads=True
        )

        # Batch ANN search
        batch_requests = []
        for point in points:
            vid_id = point.payload["vid_id"]
            prefetch = self.create_prefetch(
                siglip2_dense=point.vector["siglip2_dense"],
                search_limit=aggregation_neighbor_limit+1
            )
            batch_requests.append(models.QueryRequest(
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                filter=models.Filter(must=self.create_filters(vid_id=vid_id)),
                params=self.search_params,
                limit=aggregation_neighbor_limit+1,
                with_vector=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
                with_payload=["time_order"],
            ))
        points_neighbors = self.batch_search(collection_name, queries=batch_requests)
        points_neighbors = [neighbors[1:] for neighbors in points_neighbors]
            
        for point, neighbors in zip(points, points_neighbors):
            if not neighbors: continue
            point_time_order = float(point.payload["time_order"])
            neighbor_time_orders = [float(neighbor.payload["time_order"]) for neighbor in neighbors]
            delta = max((max(neighbor_time_orders) - min(neighbor_time_orders)) / len(neighbors), 1e-5)

            total_visual_score = 1
            total_temporal_score = 0
            for neighbor in neighbors:
                # Visual relevance score
                total_visual_score += self.cosine_similarity(point.vector["beit3_dense"], neighbor.vector["beit3_dense"])

                # Temporal relevance score
                neighbor_time_order = float(neighbor.payload["time_order"])
                siglip2_dense_score = self.cosine_similarity(feat_query["siglip2_dense"], neighbor.vector["siglip2_dense"])
                bgem3_dense_score = self.cosine_similarity(feat_query["bgem3_dense"], neighbor.vector["bgem3_dense"])
                bgem3_sparse_score = self.sparse_similarity(
                    feat_query["bgem3_sparse"].indices,
                    feat_query["bgem3_sparse"].values,
                    neighbor.vector["bgem3_sparse"].indices,
                    neighbor.vector["bgem3_sparse"].values
                )
                query_neighbor_score = (temporal_evaluation_weights[0] * siglip2_dense_score +
                                        temporal_evaluation_weights[1] * bgem3_dense_score +
                                        temporal_evaluation_weights[2] * bgem3_sparse_score)
                temporal_decay = np.exp(-((point_time_order - neighbor_time_order) ** 2) / (2 * delta ** 2))
                total_temporal_score += query_neighbor_score * temporal_decay

            aggregation_score = (np.log(total_visual_score) / len(neighbors)) * total_temporal_score
            point.score = (1 - aggregation_weight) * point.score + aggregation_weight * aggregation_score

        # Rerank based on aggregated scores
        return sorted(points, key=lambda x: x.score, reverse=True)

    #! TO BE REMOVED FROM THIS CLASS
    def search_on_image(self, collection_name: str, vid_id: str, frame_id: str, search_limit: int = 100):
        image_point = self.get_points(
            collection_name,
            filters=self.create_filters(vid_id=vid_id, frame_id=frame_id),
            with_vectors=["siglip2_dense"]
        )
        if not len(image_point): return []
        image_point = image_point[0]

        result_points = self.search(
            collection_name,
            query=self.create_prefetch(siglip2_dense=image_point.vector["siglip2_dense"], search_limit=search_limit),
            search_limit=search_limit,
            using_vectors=["siglip2_dense"]
        )

        return result_points


    #! TO BE REMOVED FROM THIS CLASS
    def do_filter(self, collection_name: str, key: str, value, pagination_limit: int = 1000):
        return self.get_points(
            collection_name,
            filters=self.create_filters(**{key: value}),
            pagination_limit=pagination_limit
        )
