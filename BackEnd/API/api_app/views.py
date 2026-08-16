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
                    "video_id": str(q_payload.get("vid_id", "")),
                    "frame_id": str(q_payload.get("frame_id", "")),
                    "img_link": str(q_payload.get("frame_path", "")),
                    "timestamp": int(q_payload.get("time_order", 0)),
                    "caption": str(q_payload.get("transcript", "")),
                    "model": model_id
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
                    "video_id": str(q_payload.get("vid_id", "")),
                    "frame_id": str(q_payload.get("frame_id", "")),
                    "img_link": str(q_payload.get("frame_path", "")),
                    "timestamp": int(q_payload.get("time_order", 0)),
                    "caption": str(q_payload.get("transcript", "")),
                    "model": model_id
                }
            }
            formatted_results.append(result_item)

        return Response({'results': formatted_results}, status = 200)

    return Response(serializer.errors, status = 400)
        

        

        


    

        