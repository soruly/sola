const EnvVars = require('./src/utils/envVars');

const config = {
  "mariadb_host": EnvVars.string('MARIADB_HOST'),
  "mariadb_user": EnvVars.string('MARIADB_USER'),
  "mariadb_pass": EnvVars.string('MARIADB_PASSWORD'),
  "mariadb_db": EnvVars.string('MARIADB_DATABASE'),
  "solr_endpoint": EnvVars.string('SOLR_ENDPOINT'),
  "solr_core": EnvVars.string('SOLR_CORE'),
  "anime_path": EnvVars.string('ANIME_PATH'),
  "hash_path": EnvVars.string('HASH_PATH'),
  "amqp_server": EnvVars.string('RABBITMQ_HOST'),
  "amqp_hash_queue": EnvVars.string('RABBITMQ_QUEUE_HASHING'),
  "amqp_load_queue": EnvVars.string('RABBITMQ_QUEUE_LOAD_HASH'),
  "discord_webhook_url": EnvVars.string('DISCORD_WEBHOOK', null),
  "telegram_channel_url": EnvVars.string('DISCORD_WEBHOOK', null),
};

module.exports = config;