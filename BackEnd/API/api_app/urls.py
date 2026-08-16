from django.urls import path, include
from .views import Search, AggregatedSearch

urlpatterns = [
    path('search/', Search, name = 'search'),
    path('aggregatedsearch/', AggregatedSearch, name = 'aggregatedSearch')
]