from rest_framework import serializers

# Request
class SearchRequestFilters(serializers.Serializer):
    min_score = serializers.FloatField(allow_null = True, required = False)
    video_id = serializers.CharField(allow_null = True, required = False)
    frame_id = serializers.CharField(allow_null = True, required = False)
    object = serializers.ListField(
        child = serializers.CharField(),
        required = False,
        allow_empty = True
    )
    min_people = serializers.IntegerField(allow_null = True, required = False)
    max_people = serializers.IntegerField(allow_null = True, required = False)
    ocr_contains = serializers.CharField(allow_null = True, required = False)
    asr_contains = serializers.CharField(allow_null = True, required = False)

class SearchRequest(serializers.Serializer):
    query = serializers.CharField(
        required = True, 
        allow_blank = True
    )
    mode = serializers.ChoiceField(
        choices = ['AUTO', 'KIS', 'QA', 'TRAKE'],
        default = 'AUTO'
    )
    collection = serializers.CharField(required = True)
    model_id = serializers.CharField(required = True)
    top_k = serializers.IntegerField(default = 100)
    language = serializers.ChoiceField(
        choices = ['AUTO', 'VI', 'EN'],
        default = 'AUTO'
    )
    filters = SearchRequestFilters(required = False)