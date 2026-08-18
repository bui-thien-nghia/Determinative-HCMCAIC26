import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
sys.path.append(str(BASE_DIR))

from rest_framework.decorators import api_view
from rest_framework.response import Response
from .serializers import SearchRequest

from BackEnd.src.db_management_tools import QueryManager
from BackEnd.src.models import SigLIP2Model, BGEM3Model

query_manager = QueryManager(
    SigLIP2Model(name="google/siglip2-so400m-patch14-384", device="cpu"),
    BGEM3Model(name="BAAI/bge-m3", device="cpu")
)

def formatResult(points: any):
    formatted_results = []
    for point in points:
        q_payload = point.payload or {}
                    
        result_item = {
            "id": str(point.id),
            "score": float(point.score),
            "image_path": str(q_payload.get("frame_path", "")),
            "video_id": str(q_payload.get("vid_id", "")),
            "timestamp": int(q_payload.get("time_order", 0)),
            "payload": {
                "video_path": str(q_payload.get("vid_path", "")),
                "video_id": str(q_payload.get("vid_id", "")),
                "frame_id": str(q_payload.get("frame_id", "")),
                "img_link": str(q_payload.get("frame_path", "")),
                "timestamp": float(q_payload.get("time_order", 0)),
                "caption": str(q_payload.get("transcript", "")),
                "fps": int(q_payload.get("fps", 0)),
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
        model_id = validated_data.get("model_id")

        try:
            points = query_manager.search(
                collection_name=collection, 
                query=query, 
                search_limit=top_k
            )
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        formatted_results = []
        for point in points:
            q_payload = point.payload or {}
            
            result_item = {
                "id": str(point.id),
                "score": float(point.score),
                "image_path": str(q_payload.get("frame_path", "")),
                "video_id": str(q_payload.get("vid_id", "")),
                "timestamp": int(q_payload.get("time_order", 0)),
                "payload": {
                    "video_path": str(q_payload.get("vid_path", "")),
                    "video_id": str(q_payload.get("vid_id", "")),
                    "frame_id": str(q_payload.get("frame_id", "")),
                    "img_link": str(q_payload.get("frame_path", "")),
                    "timestamp": float(q_payload.get("time_order", 0)),
                    "caption": str(q_payload.get("transcript", "")),
                    "fps": int(q_payload.get("fps", 0)),
                    "time_order": float(q_payload.get("time_order", 0)),
                    "frame_order": int(q_payload.get("frame_order", 0)),
                    "transcript": str(q_payload.get("transcript", "")),
                    "youtube_link": str(q_payload.get("yt_link", ""))
                }
            }
            formatted_results.append(result_item)

        return Response({'results': formatted_results}, status = 200)
    
    return Response(serializer.errors, status = 400)

@api_view(['POST'])
def AggregatedSearch(request):
    serializer = SearchRequest(data = request.data)

    if serializer.is_valid():
        validated_data = serializer.validated_data

        collection = validated_data.get("collection")
        query = validated_data.get("query")
        model_id = validated_data.get("model_id")

        try:
            points = query_manager.aggregated_search(
                collection_name=collection,
                query=query,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        formatted_results = []
        for point in points:
            q_payload = point.payload or {}

            result_item = {
                "id": str(point.id),
                "score": float(point.score),
                "image_path": str(q_payload.get("frame_path", "")),
                "video_id": str(q_payload.get("vid_id", "")),
                "timestamp": int(q_payload.get("time_order", 0)),
                "payload": {
                    "video_path": str(q_payload.get("vid_path", "")),
                    "video_id": str(q_payload.get("vid_id", "")),
                    "frame_id": str(q_payload.get("frame_id", "")),
                    "img_link": str(q_payload.get("frame_path", "")),
                    "timestamp": float(q_payload.get("time_order", 0)),
                    "caption": str(q_payload.get("transcript", "")),
                    "fps": int(q_payload.get("fps", 0)),
                    "time_order": float(q_payload.get("time_order", 0)),
                    "frame_order": int(q_payload.get("frame_order", 0)),
                    "transcript": str(q_payload.get("transcript", "")),
                    "youtube_link": str(q_payload.get("yt_link", ""))
                }
            }
            formatted_results.append(result_item)

        return Response({'results': formatted_results}, status = 200)

    return Response(serializer.errors, status = 400)
        
@api_view(['GET'])
def getCollections(request):
    try:
        collections = query_manager.list_collections()
    except Exception as e:
        return Response({'error': str(e)}, status = 500)

    return Response({'collections': collections}, status = 200)

@api_view(['POST'])
def describeSchema(request):
    collection_name = request.data.get("collection")

    if not collection_name:
        return Response({'error': 'Missing parameter'}, status=400)
    
    try:
        schema_descriptor = query_manager.describe_schema(collection_name)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

    field_mapping = {
        "frame_path": "img_link",
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
    frame_path = request.data.get("frame_path")

    if not collection or not frame_path:
        return Response({'error': 'Missing parameter'}, status=400)

    try:
        points = query_manager.search_on_image(
            collection_name = collection,
            frame_path = frame_path 
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)

    return Response({'results': formatResult(points)}, status = 200)


        