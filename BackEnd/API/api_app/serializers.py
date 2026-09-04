from rest_framework import serializers

from .team_room_service import MAX_PACKAGE_QUERY_COUNT

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
    modality = serializers.ChoiceField(
        choices = ['hybrid', 'visual', 'textual'],
        default = 'hybrid',
        required = False
    )
    filters = serializers.DictField(required = False)


class TeamRoomCreateRequest(serializers.Serializer):
    displayName = serializers.CharField(min_length=1, max_length=80, trim_whitespace=True)
    package = serializers.JSONField()


class TeamRoomQueryUpdateRequest(serializers.Serializer):
    baseQueryRevision = serializers.IntegerField(min_value=1)
    query = serializers.JSONField()


class TeamRoomConfigUpdateRequest(serializers.Serializer):
    baseRevision = serializers.IntegerField(min_value=1)
    baseConfigRevision = serializers.IntegerField(min_value=1)
    package = serializers.JSONField()


class TeamRoomHeartbeatRequest(serializers.Serializer):
    clientId = serializers.CharField(min_length=8, max_length=64, trim_whitespace=True)
    displayName = serializers.CharField(min_length=1, max_length=80, trim_whitespace=True)
    activeQueryNumber = serializers.IntegerField(min_value=1, max_value=MAX_PACKAGE_QUERY_COUNT, allow_null=True, required=False)
