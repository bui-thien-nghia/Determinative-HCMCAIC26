from django.urls import path, include
from .views import Search, AggregatedSearch, continuousSearch, getCollections, describeSchema

urlpatterns = [
    path('search/', Search, name = 'search'),
    path('aggregatedsearch/', AggregatedSearch, name = 'aggregatedSearch'),
    path('collections/', getCollections, name = 'collections'),
    path('describeschema/', describeSchema, name = 'describeSchema'),
    path('continuoussearch/', continuousSearch, name = 'continuousSearch'),
]