import re
import secrets
from datetime import timedelta

from django.utils import timezone


ROOM_CODE_PATTERN = re.compile(r'^AIC-[A-HJ-NP-Z2-9]{7}$')
FILENAME_TEMPLATE_UNSAFE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
ONLINE_WINDOW_SECONDS = 30
MAX_PACKAGE_QUERY_COUNT = 50


class PackageStructureError(ValueError):
    pass


def normalize_room_code(value):
    code = str(value or '').strip().upper()
    return code if ROOM_CODE_PATTERN.fullmatch(code) else None


def generate_room_code():
    return 'AIC-' + ''.join(secrets.choice(ROOM_ALPHABET) for _ in range(7))


def _require_int(value, label, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, int):
        raise PackageStructureError(f'{label} must be an integer.')
    if minimum is not None and value < minimum:
        raise PackageStructureError(f'{label} must be at least {minimum}.')
    if maximum is not None and value > maximum:
        raise PackageStructureError(f'{label} must be at most {maximum}.')
    return value


def _validate_filename_template(value):
    if not isinstance(value, str):
        raise PackageStructureError('filenameTemplate must be a string.')
    template = value.strip()
    if template.lower().endswith('.csv'):
        template = template[:-4]
    if not template or '{n}' not in template or '{type}' not in template:
        raise PackageStructureError('filenameTemplate must contain {n} and {type}.')
    if '..' in template or FILENAME_TEMPLATE_UNSAFE.search(template):
        raise PackageStructureError('filenameTemplate contains unsafe characters.')
    if len(template) > 160:
        raise PackageStructureError('filenameTemplate is too long.')
    return template


def validate_query(query, expected_number=None):
    if not isinstance(query, dict):
        raise PackageStructureError('Each query must be a JSON object.')
    query_number = _require_int(query.get('queryNumber'), 'queryNumber', 1, MAX_PACKAGE_QUERY_COUNT)
    if expected_number is not None and query_number != expected_number:
        raise PackageStructureError('Query number does not match the URL.')
    query_type = query.get('type')
    if query_type not in ('KIS', 'QA', 'TRAKE'):
        raise PackageStructureError('Query type must be KIS, QA, or TRAKE.')
    candidates = query.get('candidates')
    if not isinstance(candidates, list):
        raise PackageStructureError('Query candidates must be an array.')
    if len(candidates) > 100:
        raise PackageStructureError('A query cannot contain more than 100 candidates.')
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise PackageStructureError('Each candidate must be a JSON object.')
        if candidate.get('type') != query_type:
            raise PackageStructureError('Candidate type must match its query type.')
    expected_event_count = query.get('expectedEventCount')
    if expected_event_count is not None:
        if query_type != 'TRAKE':
            raise PackageStructureError('expectedEventCount is only valid for TRAKE queries.')
        _require_int(expected_event_count, 'expectedEventCount', 1, 20)
    return query


def validate_and_sanitize_package(package):
    if not isinstance(package, dict):
        raise PackageStructureError('package must be a JSON object.')
    if package.get('version') != 3:
        raise PackageStructureError('Only teamSubmissionPackage version 3 is supported.')
    query_count = _require_int(package.get('queryCount'), 'queryCount', 1, MAX_PACKAGE_QUERY_COUNT)
    filename_template = _validate_filename_template(package.get('filenameTemplate'))
    queries = package.get('queries')
    if not isinstance(queries, list) or len(queries) != query_count:
        raise PackageStructureError('queries length must match queryCount.')

    numbers = set()
    for query in queries:
        validate_query(query)
        number = query['queryNumber']
        if number > query_count:
            raise PackageStructureError('queryNumber is outside the configured package range.')
        if number in numbers:
            raise PackageStructureError('queryNumber values must be unique.')
        numbers.add(number)
    if numbers != set(range(1, query_count + 1)):
        raise PackageStructureError('queries must contain every query number from 1 to queryCount.')

    sanitized = dict(package)
    sanitized.pop('activeQueryId', None)
    sanitized['filenameTemplate'] = filename_template
    sanitized['queries'] = queries
    return sanitized


def online_members(room):
    cutoff = timezone.now() - timedelta(seconds=ONLINE_WINDOW_SECONDS)
    return [
        {
            'clientId': member.client_id,
            'displayName': member.display_name,
            'activeQueryNumber': member.active_query_number,
        }
        for member in room.presence_entries.filter(last_seen__gte=cutoff).order_by('display_name', 'client_id')
    ]


def room_payload(room, include_package=True):
    payload = {
        'roomCode': room.code,
        'revision': room.revision,
        'configRevision': room.config_revision,
        'queryRevisions': room.query_revisions,
        'members': online_members(room),
    }
    if include_package:
        payload['package'] = room.package_json
    return payload
