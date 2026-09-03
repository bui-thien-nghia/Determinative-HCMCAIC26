from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='TeamRoom',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=16, unique=True)),
                ('package_json', models.JSONField()),
                ('revision', models.PositiveIntegerField(default=1)),
                ('query_revisions', models.JSONField(default=dict)),
                ('config_revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='TeamRoomPresence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('client_id', models.CharField(max_length=64)),
                ('display_name', models.CharField(max_length=80)),
                ('active_query_number', models.PositiveIntegerField(blank=True, null=True)),
                ('last_seen', models.DateTimeField(auto_now=True)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='presence_entries', to='api_app.teamroom')),
            ],
            options={
                'indexes': [models.Index(fields=['room', 'last_seen'], name='api_app_tea_room_id_6c52dc_idx')],
                'constraints': [models.UniqueConstraint(fields=('room', 'client_id'), name='unique_team_room_client')],
            },
        ),
    ]
