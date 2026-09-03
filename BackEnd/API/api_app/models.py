from django.db import models


class TeamRoom(models.Model):
    code = models.CharField(max_length=16, unique=True, db_index=True)
    package_json = models.JSONField()
    revision = models.PositiveIntegerField(default=1)
    query_revisions = models.JSONField(default=dict)
    config_revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TeamRoomPresence(models.Model):
    room = models.ForeignKey(TeamRoom, on_delete=models.CASCADE, related_name='presence_entries')
    client_id = models.CharField(max_length=64)
    display_name = models.CharField(max_length=80)
    active_query_number = models.PositiveIntegerField(null=True, blank=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('room', 'client_id'), name='unique_team_room_client'),
        ]
        indexes = [models.Index(fields=('room', 'last_seen'))]
