from django.db import IntegrityError, transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import TeamRoom, TeamRoomPresence
from .serializers import (
    TeamRoomConfigUpdateRequest,
    TeamRoomCreateRequest,
    TeamRoomHeartbeatRequest,
    TeamRoomQueryUpdateRequest,
)
from .team_room_service import (
    PackageStructureError,
    generate_room_code,
    normalize_room_code,
    online_members,
    room_payload,
    validate_and_sanitize_package,
    validate_query,
)


MAX_TEAM_ROOM_REQUEST_BYTES = 2 * 1024 * 1024


@api_view(['GET'])
def teamRoomHealth(_request):
    return Response({'status': 'ok', 'service': 'team-room'})


def _room_or_none(code):
    normalized = normalize_room_code(code)
    if not normalized:
        return None
    try:
        return TeamRoom.objects.get(code=normalized)
    except TeamRoom.DoesNotExist:
        return None


def _request_too_large(request):
    try:
        return int(request.META.get('CONTENT_LENGTH') or 0) > MAX_TEAM_ROOM_REQUEST_BYTES
    except (TypeError, ValueError):
        return True


def _invalid_request(serializer):
    return Response({'code': 'INVALID_REQUEST', 'message': 'Invalid room request.', 'details': serializer.errors}, status=400)


@api_view(['POST'])
def createTeamRoom(request):
    if _request_too_large(request):
        return Response({'code': 'REQUEST_TOO_LARGE', 'message': 'Room package is too large.'}, status=413)
    serializer = TeamRoomCreateRequest(data=request.data)
    if not serializer.is_valid():
        return _invalid_request(serializer)
    try:
        package = validate_and_sanitize_package(serializer.validated_data['package'])
    except PackageStructureError as error:
        return Response({'code': 'INVALID_PACKAGE', 'message': str(error)}, status=400)

    query_revisions = {str(query['queryNumber']): 1 for query in package['queries']}
    room = None
    for _ in range(10):
        try:
            room = TeamRoom.objects.create(code=generate_room_code(), package_json=package, query_revisions=query_revisions)
            break
        except IntegrityError:
            continue
    if room is None:
        return Response({'code': 'ROOM_CREATE_FAILED', 'message': 'Could not generate a room code.'}, status=503)
    return Response(room_payload(room), status=201)


@api_view(['GET'])
def getTeamRoom(request, code):
    room = _room_or_none(code)
    if room is None:
        return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)
    since_revision = request.query_params.get('since_revision')
    if since_revision is not None:
        try:
            if int(since_revision) == room.revision:
                return Response({'changed': False, 'revision': room.revision, 'members': online_members(room)})
        except (TypeError, ValueError):
            return Response({'code': 'INVALID_REVISION', 'message': 'since_revision must be an integer.'}, status=400)
    return Response({'changed': True, **room_payload(room)})


@api_view(['PATCH'])
def updateTeamRoomQuery(request, code, query_number):
    if _request_too_large(request):
        return Response({'code': 'REQUEST_TOO_LARGE', 'message': 'Query update is too large.'}, status=413)
    serializer = TeamRoomQueryUpdateRequest(data=request.data)
    if not serializer.is_valid():
        return _invalid_request(serializer)
    normalized = normalize_room_code(code)
    if normalized is None:
        return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)

    with transaction.atomic():
        try:
            room = TeamRoom.objects.select_for_update().get(code=normalized)
        except TeamRoom.DoesNotExist:
            return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)
        current_revision = int(room.query_revisions.get(str(query_number), 1))
        query = serializer.validated_data['query']
        try:
            validate_query(query, expected_number=query_number)
        except PackageStructureError as error:
            return Response({'code': 'INVALID_QUERY', 'message': str(error)}, status=400)
        if serializer.validated_data['baseQueryRevision'] != current_revision:
            latest_query = next((item for item in room.package_json.get('queries', []) if item.get('queryNumber') == query_number), None)
            return Response({
                'code': 'QUERY_CONFLICT',
                'message': f'Query {query_number} was changed by another team member.',
                'roomRevision': room.revision,
                'queryRevision': current_revision,
                'latestQuery': latest_query,
            }, status=409)

        package = dict(room.package_json)
        queries = list(package.get('queries', []))
        index = next((index for index, item in enumerate(queries) if item.get('queryNumber') == query_number), None)
        if index is None:
            return Response({'code': 'QUERY_NOT_FOUND', 'message': 'Query not found in this room.'}, status=404)
        queries[index] = query
        package['queries'] = queries
        try:
            package = validate_and_sanitize_package(package)
        except PackageStructureError as error:
            return Response({'code': 'INVALID_QUERY', 'message': str(error)}, status=400)

        next_query_revision = current_revision + 1
        query_revisions = dict(room.query_revisions)
        query_revisions[str(query_number)] = next_query_revision
        room.package_json = package
        room.query_revisions = query_revisions
        room.revision += 1
        room.save(update_fields=('package_json', 'query_revisions', 'revision', 'updated_at'))
        return Response({'ok': True, 'revision': room.revision, 'queryRevision': next_query_revision, 'query': query})


@api_view(['PATCH'])
def updateTeamRoomConfig(request, code):
    if _request_too_large(request):
        return Response({'code': 'REQUEST_TOO_LARGE', 'message': 'Package update is too large.'}, status=413)
    serializer = TeamRoomConfigUpdateRequest(data=request.data)
    if not serializer.is_valid():
        return _invalid_request(serializer)
    normalized = normalize_room_code(code)
    if normalized is None:
        return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)
    try:
        package = validate_and_sanitize_package(serializer.validated_data['package'])
    except PackageStructureError as error:
        return Response({'code': 'INVALID_PACKAGE', 'message': str(error)}, status=400)

    with transaction.atomic():
        try:
            room = TeamRoom.objects.select_for_update().get(code=normalized)
        except TeamRoom.DoesNotExist:
            return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)
        if serializer.validated_data['baseRevision'] != room.revision or serializer.validated_data['baseConfigRevision'] != room.config_revision:
            return Response({
                'code': 'CONFIG_CONFLICT',
                'message': 'The shared room changed while Package Setup was open.',
                **room_payload(room),
            }, status=409)

        previous_revisions = room.query_revisions
        room.query_revisions = {
            str(query['queryNumber']): int(previous_revisions.get(str(query['queryNumber']), 0)) + 1
            for query in package['queries']
        }
        room.package_json = package
        room.revision += 1
        room.config_revision += 1
        room.save(update_fields=('package_json', 'query_revisions', 'revision', 'config_revision', 'updated_at'))
        return Response({'ok': True, **room_payload(room)})


@api_view(['POST'])
def heartbeatTeamRoom(request, code):
    serializer = TeamRoomHeartbeatRequest(data=request.data)
    if not serializer.is_valid():
        return _invalid_request(serializer)
    room = _room_or_none(code)
    if room is None:
        return Response({'code': 'ROOM_NOT_FOUND', 'message': 'Room not found.'}, status=404)
    TeamRoomPresence.objects.update_or_create(
        room=room,
        client_id=serializer.validated_data['clientId'],
        defaults={
            'display_name': serializer.validated_data['displayName'],
            'active_query_number': serializer.validated_data.get('activeQueryNumber'),
        },
    )
    return Response({'ok': True, 'members': online_members(room)})
