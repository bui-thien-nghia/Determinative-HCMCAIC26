# 1. Overall dataset structure

The following describes the structure of the extraction results:

```txt
dataset_name/
└── feats/
│   ├── beit3_dense/
│   │   └── L01_V001/
│   │   │   ├── 001.npy
│   │   │   └── ...
│   │   └── ...
│   ├── bgem3_dense/
│   │   └── L01_V001/
│   │   │   ├── 001.npy
│   │   │   └── ...
│   │   └── ...
│   ├── bgem3_sparse/
│   │   ├── token_ids/
│   │   │   └── L01_V001/
│   │   │   │   ├── 001.npy
│   │   │   │   └── ...
│   │   │   └── ...
│   │   └── weights/
│   │       └── L01_V001/
│   │           ├── 001.npy
│   │           └── ...
│   │           └── ...
│   └── siglip2_dense/
│       └── L01_V001/
│           ├── 001.npy
│           └── ...
│           └── ...
└── imgs/
│   └── L01_V001/
│       ├── 001.jpg
│       └── ...
│   └── ...
└── maps/
│   ├── L01_V001.csv
│   └── ...
└── trans/
│   └── L01_V001/
│       ├── 001.jpg
│       └── ...
│   └── ...
└── vids/
    ├── L01_V001.mp4
    └── ...
```

The structure of folder **must strictly follow this naming and organizing convention** for the Python codebase to work.

# 2. Folder's components

Up to this point, all codes used for extraction and database creation are compacted into 4 separate Python files:

```txt
src/
├── db_management_tools.py
├── extraction_tools.py
├── models.py
└── peripheral_tools.py
```

In the future, a Python file for more intensive AI model implementation of advanced features will be included.

Along the Python files is a `requirements.txt`, modules needed to run the codes properly **in Python 3.12 environment**.

## 2.1. Implementation of models.py

Every models used for the retrieval pipeline will be wrapped by the universal `ExtractionModel` class, with 2 main functions:

- `load()`: Load the model to GPU when needed
- `run()`: Encode the inputs and return the corresponding feature vectors. This is implemented differently across different models

The exception goes to `TransNetV2Model`, which returns the information of the keyframe timestamps instead of the direct features itself.

## 2.2. Implementation of extraction_tools.py

The extraction tool file consists of 2 classes: `KeyframeAndFeatureExtractor`, dealing with keyframe extraction, keyframe feature extraction, and redundancy removal; and `TranscriptAndFeatureExtractor`, dealing with transcription, transcript segmentation & chunking, and transcript feature extraction.

Available methods of `KeyframeAndFeatureExtractor`:

- `extract_keyframes_and_features()`: Use shot segmentation model and feature extraction model to get scene keyframes, their mapped location to videos, and their features.
- `filter_with_clustering()`: Cluster visually identical images and only pick the representative frame for each cluster, cutting down on duplicates or redundant frames.
- `save_images_and_features()`: Save the processed images, features, and maps.
- `extract_and_save_keyframes()`: Do the extraction steps end-to-end.

Available methods of `TranscriptAndFeatureExtractor`:

- `transcribe_and_segment_transcript()`: Use transcription model to get transcripts and divide them into chunks.
- `align_transcript_keyframe()`: Concatenate the chunks and match them based on the keyframes' timestamps.
- `extract_transcription_features()`: Use feature extraction model to get transcript chunks' features. This method can return up to 3 types of features:
	- `dense`: The semantic feature
	- `sparse`: The word-by-word feature
	- `multi`: A list of word-level vectors for late interaction
- `extract_and_save_keyframes()`: Do the extraction steps end-to-end.
- `save_transcripts_and_features()`: Save the transcript chunks and their features according to the mappings.
- `extract_and_save_transcripts()`: Do the extraction steps end-to-end.

Note: The models **do not come with the classes** and must be explicitly added as arguments by creating model classes provided in `models.py`
## 2.3. Implementation of db_management_tools.py

Database management code contains 2 components: `DataLoader` class, uploading a dataset onto a Qdrant database; and `QueryManager`, encoding and searching on an available Qdrant database.

Available methods of `DataLoader`:

- `create_new_collection()`, `list_collections()`, `delete_collection()`: Create, list, and delete collections respectively.
- `form_points()`: Reformat dataset's samples to `PointStruct` instances compatible with upload.
- `upsert_to_db()`: Perform upload to the connected Qdrant database.
- `create_and_fill_database()`: Do the uploading steps end-to-end.

Note: The models **do not come with the `QueryManager`** and must be explicitly added as arguments by creating model classes provided in `models.py`

Available methods of `QueryManager`:

- `encode_query()`: Create, list, and delete collections respectively.
- `cosine_similarity()`, `sparse_similarity()`: Customized similarity calculation implementation for normalized vectors.
- `create_prefetch()`: Create a list of prefetch for the queries.
- `create_filter()`: Create a field condition class for the queries
- `search()`: Search the database with customizable prefetch settings, filters and return fields.
- `aggregated_search()` (Experimental): A more intensive method of searching that re-ranks the frames based on temporal relevance aggregation. **This still requires more benchmarks and evaluation**.

## 2.4. Implementation of peripheral_tools.py

Currently, the peripherals only contain a query result display for testing on Python notebooks. In the future, am automatic benchmarking pipeline will be available in this code file.

# 3. Local setup instruction

1. Prepare video dataset for retrieval.
2. You should use a Python 3.12 environment for this setup (a **virtual environment** is recommended). When the environment is ready for use, install the dependencies:

```bash
pip install -r requirements.txt
```

3. Use `KeyframeAndFeatureExtractor` and `TranscriptAndFeatureExtractor` pointed the dataset directory to preprocess the dataset. Make sure the preprocessed dataset has the structure mentioned in the first part.
4. Install Docker Desktop: https://www.docker.com/products/docker-desktop/
5. Pull and run a Qdrant database container:
6. You can see a new container with qdrant/qdrant image. If it is not on yet, run it.
7. Use `DataLoader` pointed to the dataset directory to upload it to Qdrant.
8. Now that the database is ready to use, you can use `QueryManager` to search on it with either `search()` or `aggregated_search()` method.

Notes:
- If you already had a properly formatted preprocessed dataset, you can skip Step 1 and 2.
- If you only want to extract image/text features on your own extracted set of keyframes/transcripts, importing models from `models.py` instead of using modules from `extraction_tools.py` is highly recommended.
- Examples of how to use the the codes are provided within the `src/` folder.