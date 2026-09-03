from django.test import Client, TestCase, override_settings
from rest_framework.test import APIRequestFactory

from .models import TeamRoom
from .team_room_views import (
    createTeamRoom,
    getTeamRoom,
    heartbeatTeamRoom,
    updateTeamRoomConfig,
    updateTeamRoomQuery,
)

urlpatterns = []


def query(number, query_type='KIS'):
    return {
        'id': f'query-{number}',
        'queryNumber': number,
        'type': query_type,
        'candidates': [],
        'reviewed': False,
        'notes': '',
        'updatedAt': 0,
    }


def package(query_count=2):
    return {
        'version': 3,
        'queryCount': query_count,
        'filenameTemplate': 'query-p2-{n}-{type}',
        'activeQueryId': 'query-2',
        'queries': [
            query(number, 'QA' if number == 2 else 'KIS')
            for number in range(1, query_count + 1)
        ],
    }


class TeamRoomApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.client = Client()
        response = createTeamRoom(self.factory.post(
            '/api/team-room/create/',
            {'displayName': 'Kent', 'package': package()},
            format='json',
        ))
        self.assertEqual(response.status_code, 201)
        self.code = response.data['roomCode']

    def test_health_endpoint_is_available(self):
        response = self.client.get('/api/team-room/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok', 'service': 'team-room'})

    def test_create_sanitizes_local_active_query_and_poll_is_revision_based(self):
        room = TeamRoom.objects.get(code=self.code)
        self.assertNotIn('activeQueryId', room.package_json)
        detail = getTeamRoom(self.factory.get(f'/api/team-room/{self.code}/'), self.code)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['roomCode'], self.code)
        self.assertEqual(detail.data['package']['queryCount'], 2)
        response = getTeamRoom(self.factory.get(
            f'/api/team-room/{self.code}/',
            {'since_revision': room.revision},
        ), self.code)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['changed'])
        self.assertNotIn('package', response.data)

    def test_room_not_found_returns_404(self):
        response = getTeamRoom(self.factory.get('/api/team-room/AIC-2222222/'), 'AIC-2222222')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'ROOM_NOT_FOUND')

    def test_create_accepts_50_query_package_and_rejects_51(self):
        accepted = createTeamRoom(self.factory.post(
            '/api/team-room/create/',
            {'displayName': 'Kent', 'package': package(50)},
            format='json',
        ))
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(accepted.data['package']['queryCount'], 50)
        self.assertEqual(len(accepted.data['package']['queries']), 50)

        rejected = createTeamRoom(self.factory.post(
            '/api/team-room/create/',
            {'displayName': 'Kent', 'package': package(51)},
            format='json',
        ))
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.data['code'], 'INVALID_PACKAGE')
        self.assertEqual(rejected.data['message'], 'queryCount must be at most 50.')

    def test_query_update_increments_query_and_room_revision_and_rejects_stale_write(self):
        updated = query(1)
        updated['candidates'] = [{
            'id': 'candidate-1',
            'type': 'KIS',
            'videoId': 'L23_V021',
            'frameOrder': 8500,
        }]
        accepted = updateTeamRoomQuery(self.factory.patch(
            f'/api/team-room/{self.code}/query/1/',
            {'baseQueryRevision': 1, 'query': updated},
            format='json',
        ), self.code, 1)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data['queryRevision'], 2)
        self.assertEqual(accepted.data['revision'], 2)

        conflict = updateTeamRoomQuery(self.factory.patch(
            f'/api/team-room/{self.code}/query/1/',
            {'baseQueryRevision': 1, 'query': query(1)},
            format='json',
        ), self.code, 1)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data['code'], 'QUERY_CONFLICT')
        self.assertEqual(conflict.data['latestQuery']['candidates'][0]['frameOrder'], 8500)

    def test_different_query_updates_survive(self):
        first = updateTeamRoomQuery(self.factory.patch(
            f'/api/team-room/{self.code}/query/1/',
            {'baseQueryRevision': 1, 'query': query(1)},
            format='json',
        ), self.code, 1)
        second = updateTeamRoomQuery(self.factory.patch(
            f'/api/team-room/{self.code}/query/2/',
            {'baseQueryRevision': 1, 'query': query(2, 'QA')},
            format='json',
        ), self.code, 2)
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        room = TeamRoom.objects.get(code=self.code)
        self.assertEqual(room.query_revisions, {'1': 2, '2': 2})
        self.assertEqual(room.revision, 3)

    def test_config_update_conflicts_after_any_room_change(self):
        updateTeamRoomQuery(self.factory.patch(
            f'/api/team-room/{self.code}/query/1/',
            {'baseQueryRevision': 1, 'query': query(1)},
            format='json',
        ), self.code, 1)
        conflict = updateTeamRoomConfig(self.factory.patch(
            f'/api/team-room/{self.code}/config/',
            {'baseRevision': 1, 'baseConfigRevision': 1, 'package': package()},
            format='json',
        ), self.code)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data['code'], 'CONFIG_CONFLICT')

    def test_config_update_applies_package_setup(self):
        next_package = package(3)
        response = updateTeamRoomConfig(self.factory.patch(
            f'/api/team-room/{self.code}/config/',
            {'baseRevision': 1, 'baseConfigRevision': 1, 'package': next_package},
            format='json',
        ), self.code)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['package']['queryCount'], 3)
        self.assertEqual(response.data['configRevision'], 2)
        self.assertEqual(response.data['revision'], 2)

    def test_heartbeat_updates_presence_without_changing_submission_revision(self):
        before = TeamRoom.objects.get(code=self.code).revision
        response = heartbeatTeamRoom(self.factory.post(
            f'/api/team-room/{self.code}/heartbeat/',
            {'clientId': 'client-12345678', 'displayName': 'Nghia', 'activeQueryNumber': 2},
            format='json',
        ), self.code)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['members'][0]['activeQueryNumber'], 2)
        self.assertEqual(TeamRoom.objects.get(code=self.code).revision, before)


@override_settings(ROOT_URLCONF='API.team_room_urls')
class TeamRoomOnlyUrlConfTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_endpoint_is_available(self):
        response = self.client.get('/api/team-room/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok', 'service': 'team-room'})

    def test_team_room_routes_work(self):
        response = self.client.post(
            '/api/team-room/create/',
            {'displayName': 'Kent', 'package': package()},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        room_code = response.json()['roomCode']

        detail = self.client.get(f'/api/team-room/{room_code}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['roomCode'], room_code)

    def test_retrieval_routes_are_not_available(self):
        for path in (
            '/api/search/',
            '/api/filter/',
            '/api/continuoussearch/',
            '/api/aggregatedsearch/',
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 404)
