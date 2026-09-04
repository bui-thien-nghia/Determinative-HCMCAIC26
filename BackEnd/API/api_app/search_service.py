class AdvancedQueryService:
    def __init__(self, db_manager):
        self.db = db_manager

    FIELD_MAPPING = {
        "img_link": "frame_path",
        "video_id": "vid_id",
        "video_path": "vid_path",
        "youtube_link": "yt_link",
        "timestamp": "time_order",
    }

    RANGE_FIELDS = {"frame_order", "time_order"}

    def _payload_key(self, key: str):
        return self.FIELD_MAPPING.get(key, key)

    def _range_tuple(self, value):
        if not isinstance(value, dict):
            return None
        gte = value.get("from", value.get("gte"))
        lte = value.get("to", value.get("lte"))
        return (gte, lte)

    def _bounded_frame_id_values(self, value):
        range_value = self._range_tuple(value)
        if not range_value:
            return None

        gte, lte = range_value
        if gte is None or lte is None:
            return None

        start = int(gte)
        end = int(lte)
        values = []
        for frame_id in range(start, end + 1):
            values.append(str(frame_id))
            values.append(f"{frame_id:03d}")
            values.append(f"{frame_id:04d}")
            values.append(f"{frame_id:05d}")
        return sorted(set(values))

    def _sort_frame_order(self, point):
        value = (point.payload or {}).get("frame_order", 0)
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def create_search_filters(self, filters: dict | None):
        if not filters:
            return []

        filter_kwargs = {}
        for raw_key, raw_value in filters.items():
            key = self._payload_key(raw_key)
            if raw_value is None or raw_value == "":
                continue

            if key in self.RANGE_FIELDS:
                filter_kwargs[key] = self._range_tuple(raw_value) if isinstance(raw_value, dict) else raw_value
            elif key == "frame_id" and isinstance(raw_value, dict):
                frame_id_values = self._bounded_frame_id_values(raw_value)
                if not frame_id_values:
                    raise ValueError("Frame Id range filtering requires both From and To because frame_id is stored as a keyword payload.")
                filter_kwargs[key] = {"any": frame_id_values}
            elif key == "transcript":
                filter_kwargs[key] = {"match_text": str(raw_value)}
            else:
                filter_kwargs[key] = raw_value

        return self.db.create_filters(**filter_kwargs)

    def do_filter(
        self,
        collection_name: str,
        filters: dict | None = None,
        key: str | None = None,
        value = None,
        pagination_limit: int = 1000,
        max_results: int = 100,
    ):
        if filters is None and key:
            filters = {key: value}

        qdrant_filters = self.create_search_filters(filters)
        if not qdrant_filters:
            raise ValueError("Enter at least one supported filter.")

        points = self.db.get_points(
            collection_name,
            filters=qdrant_filters,
            pagination_limit=min(pagination_limit, max_results),
            max_results=max_results
        )
        return sorted(
            points,
            key=lambda point: (
                str((point.payload or {}).get("vid_id", "")),
                self._sort_frame_order(point),
                str((point.payload or {}).get("frame_id", "")),
            )
        )

    def search(
        self,
        collection_name: str,
        query: str,
        search_limit: int = 100,
        filters: dict | None = None,
        using_vectors=None
    ):
        search_kwargs = {
            "collection_name": collection_name,
            "query": query,
            "search_limit": search_limit,
            "filter": self.create_search_filters(filters),
        }
        if using_vectors is not None:
            search_kwargs["using_vectors"] = using_vectors
        return self.db.search(**search_kwargs)

    def aggregated_search(self, collection_name: str, query: str, search_limit: int = 100, filters: dict | None = None):
        return self.db.aggregated_search(
            collection_name=collection_name,
            query=query,
            search_limit=search_limit,
            filter=self.create_search_filters(filters)
        )

    def search_on_image(self, collection_name: str, vid_id: str, frame_id: str, search_limit: int = 100):
        image_point = self.db.get_points(
            collection_name,
            filters=self.db.create_filters(vid_id=vid_id, frame_id=frame_id),
            with_vectors=["siglip2_dense"]
        )
        if not len(image_point): return []
        image_feat = image_point[0].vector["siglip2_dense"]

        result_points = self.db.search(
            collection_name,
            query=image_feat,
            search_limit=search_limit,
            using_vectors="siglip2_dense"
        )

        return result_points
