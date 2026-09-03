from django.urls import path, include
from .views import (
    AggregatedSearch,
    Search,
    continuousSearch,
    describeSchema,
    doFilter,
    getCollections,
)
from .team_room_views import createTeamRoom, getTeamRoom, heartbeatTeamRoom, updateTeamRoomConfig, updateTeamRoomQuery

urlpatterns = [
    path('search/', Search, name = 'search'),
    path('aggregatedsearch/', AggregatedSearch, name = 'aggregatedSearch'),
    path('collections/', getCollections, name = 'collections'),
    path('describeschema/', describeSchema, name = 'describeSchema'),
    path('continuoussearch/', continuousSearch, name = 'continuousSearch'),
    path('filter/', doFilter, name = 'filter'),
    path('team-room/create/', createTeamRoom, name='teamRoomCreate'),
    path('team-room/<str:code>/', getTeamRoom, name='teamRoomDetail'),
    path('team-room/<str:code>/query/<int:query_number>/', updateTeamRoomQuery, name='teamRoomQueryUpdate'),
    path('team-room/<str:code>/config/', updateTeamRoomConfig, name='teamRoomConfigUpdate'),
    path('team-room/<str:code>/heartbeat/', heartbeatTeamRoom, name='teamRoomHeartbeat'),
]
