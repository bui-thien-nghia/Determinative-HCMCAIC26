class AdvancedQueryService:
    def __init__(self, db_manager):
        self.db = db_manager

    def do_filter(self, collection_name: str, key: str, value, pagination_limit: int = 1000):
        return self.db.get_points(
            collection_name,
            filters=self.db.create_filters(**{key: value}),
            pagination_limit=pagination_limit
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