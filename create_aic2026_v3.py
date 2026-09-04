from qdrant_client import QdrantClient
from src.db_management_tools import DataLoader


COLLECTION_NAME = "aic2026_v3"
DATASET_DIR = "AIC26"
QDRANT_URL = "http://localhost:6333"


def main():

    client = QdrantClient(
        url=QDRANT_URL
    )

    # Check collection cũ
    collections = [
        c.name for c in client.get_collections().collections
    ]

    if COLLECTION_NAME in collections:
        print(f"Collection {COLLECTION_NAME} already exists.")
        print("Deleting old collection...")
        
        client.delete_collection(
            collection_name=COLLECTION_NAME
        )

        print("Deleted.")

    # Load dataset
    loader = DataLoader(
        dataset_dir=DATASET_DIR,
        database_client_url=QDRANT_URL,
        vid_dir="vids"
    )

    print("Creating and uploading collection...")
    
    loader.create_and_fill_database(
        collection_name=COLLECTION_NAME,
        upload_batch_size=256,
        upload_num_workers=1
    )

    print("\nFinished.")

    loader.list_collections()


if __name__ == "__main__":
    main()