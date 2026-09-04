import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
sys.path.append(str(BASE_DIR))

from rest_framework.decorators import api_view
from rest_framework.response import Response
from .serializers import SearchRequest

query_manager = None
advanced_query_service = None

MODALITY_VECTOR_MAP = {
    "hybrid": [
        "siglip2_dense",
        "bgem3_dense",
        "bgem3_sparse",
    ],
    "visual": [
        "siglip2_dense",
    ],
    "textual": [
        "bgem3_dense",
        "bgem3_sparse",
    ],
}


def get_query_manager():
    global query_manager
    if query_manager is None:
        from BackEnd.src.db_management_tools import QueryManager
        from BackEnd.src.models import BGEM3Model, SigLIP2Model

        query_manager = QueryManager(
            SigLIP2Model(name="google/siglip2-giant-opt-patch16-384", device="cpu"),
            BGEM3Model(name="BAAI/bge-m3", device="cpu")
        )
    return query_manager


def get_advanced_query_service():
    global advanced_query_service
    if advanced_query_service is None:
        from .search_service import AdvancedQueryService

        advanced_query_service = AdvancedQueryService(get_query_manager())
    return advanced_query_service

def formatResult(points: any):
    formatted_results = []
    for point in points:
        q_payload = point.payload or {}
                    
        result_item = {
            "id": str(point.id),
            "score": float(getattr(point, "score", 0)),
            "image_path": str(q_payload.get("frame_path", "")),
            "video_id": str(q_payload.get("vid_id", "")),
            "timestamp": float(q_payload.get("time_order", 0)),
            "payload": {
                "video_path": str(q_payload.get("vid_path", "")),
                "video_id": str(q_payload.get("vid_id", "")),
                "frame_id": str(q_payload.get("frame_id", "")),
                "img_link": str(q_payload.get("frame_path", "")),
                "timestamp": float(q_payload.get("time_order", 0)),
                "caption": str(q_payload.get("transcript", "")),
                "fps": float(q_payload.get("fps", 0)),
                "time_order": float(q_payload.get("time_order", 0)),
                "frame_order": int(q_payload.get("frame_order", 0)),
                "transcript": str(q_payload.get("transcript", "")),
                "youtube_link": str(q_payload.get("yt_link", ""))
            }
        }
        formatted_results.append(result_item)

    return formatted_results


@api_view(['POST'])
def Search(request):
    serializer = SearchRequest(data = request.data)

    if serializer.is_valid():
        validated_data = serializer.validated_data

        query = validated_data.get("query")
        collection = validated_data.get("collection")
        top_k = validated_data.get("top_k")
        filters = validated_data.get("filters")
        modality = validated_data.get("modality")
        using_vectors = MODALITY_VECTOR_MAP[modality]

        if not query:
            return Response({'error': 'Enter a query or use /api/filter/ for filter-only search.'}, status=400)

        try:
            points = get_advanced_query_service().search(
                collection_name=collection,
                query=query,
                search_limit=top_k,
                filters=filters,
                using_vectors=using_vectors
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        return Response({'results': formatResult(points)}, status = 200)
    
    return Response(serializer.errors, status = 400)

@api_view(['POST'])
def AggregatedSearch(request):
    serializer = SearchRequest(data = request.data)

    if serializer.is_valid():
        validated_data = serializer.validated_data

        collection = validated_data.get("collection")
        query = validated_data.get("query")
        top_k = validated_data.get("top_k")
        filters = validated_data.get("filters")

        if not query:
            return Response({'error': 'Enter a query or use /api/filter/ for filter-only search.'}, status=400)

        try:
            points = get_advanced_query_service().aggregated_search(
                collection_name=collection,
                query=query,
                search_limit=top_k,
                filters=filters
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        return Response({'results': formatResult(points)}, status = 200)

    return Response(serializer.errors, status = 400)
        
@api_view(['GET'])
def getCollections(request):
    try:
        collections = get_query_manager().list_collections()
    except Exception as e:
        return Response({'error': str(e)}, status = 500)

    return Response({'collections': collections}, status = 200)

@api_view(['POST'])
def describeSchema(request):
    collection_name = request.data.get("collection")

    if not collection_name:
        return Response({'error': 'Missing parameter'}, status=400)
    
    try:
        schema_descriptor = get_query_manager().describe_schema(collection_name)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

    field_mapping = {
        "frame_path": "img_link",
        "vid_id": "video_id",
        "vid_path": "video_path",
        "yt_link": "youtube_link",
    }

    formatted_schema = {}
    for field, attributes in schema_descriptor.items():
        ui_field = field_mapping.get(field, field)
        formatted_schema[ui_field] = {
            "data_type": str(attributes.get("data_type", "")),
            "is_indexed": bool(attributes.get("is_indexed", False))
        }

    return Response({'schema': formatted_schema}, status = 200)

@api_view(['POST'])
def continuousSearch(request):
    collection = request.data.get("collection")
    video_id = request.data.get("video_id")
    frame_id = request.data.get("frame_id")

    if not collection or not video_id or not frame_id:
        return Response({'error': 'Missing parameter'}, status=400)

    try:
        points = get_advanced_query_service().search_on_image(
            collection_name = collection,
            vid_id = video_id,
            frame_id = frame_id, 
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)

    return Response({'results': formatResult(points)}, status = 200)

@api_view(['POST'])
def doFilter(request):
    collection_name = request.data.get("collection")
    filters = request.data.get("filters")
    key = request.data.get("key")
    value = request.data.get("value")
    top_k = int(request.data.get("top_k") or 100)

    if not collection_name or (not filters and (not key or value in (None, ""))):
        return Response({'error': 'Missing parameter'}, status = 400)

    try:
        points = get_advanced_query_service().do_filter(
            collection_name = collection_name,
            filters = filters,
            key = key,
            value = value,
            max_results = max(1, min(1000, top_k)),
        )
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception as e:
        return Response({'error': 'Filter search failed.'}, status=500)

    return Response({'results': formatResult(points)}, status = 200)
