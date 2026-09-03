from django.urls import path

from api_app.team_room_views import (
    createTeamRoom,
    getTeamRoom,
    heartbeatTeamRoom,
    teamRoomHealth,
    updateTeamRoomConfig,
    updateTeamRoomQuery,
)


urlpatterns = [
    path('api/team-room/health/', teamRoomHealth, name='teamRoomHealth'),
    path('api/team-room/create/', createTeamRoom, name='teamRoomCreate'),
    path('api/team-room/<str:code>/', getTeamRoom, name='teamRoomDetail'),
    path('api/team-room/<str:code>/query/<int:query_number>/', updateTeamRoomQuery, name='teamRoomQueryUpdate'),
    path('api/team-room/<str:code>/config/', updateTeamRoomConfig, name='teamRoomConfigUpdate'),
    path('api/team-room/<str:code>/heartbeat/', heartbeatTeamRoom, name='teamRoomHeartbeat'),
]
