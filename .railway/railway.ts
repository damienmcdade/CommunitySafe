import { defineRailway, postgres, preserve, project, redis, service, volume } from "railway/iac";

// Railway Infrastructure as Code. Replaces the deprecated Config as Code
// (railway.json), which stops being read on 2026-12-01.
//
// Imported with `railway config pull` rather than `railway config migrate`:
// migrate translates the json files and invented a service named
// "CommunitySafe", while the live service is "communitysafe-api" — applying
// that would have read as creating a new service rather than describing the
// existing one. Pulling describes what is actually deployed.
//
// Secrets stay in Railway: every env var is preserve(), so this file records
// WHICH variables the service expects without ever putting their values in
// the repo.

export default defineRailway(() => {
  const RedisRKj = redis("Redis-r-kj", { region: "us-west2" });
  RedisRKj.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  RedisRKj.networking = { privateNetworkEndpoint: "redis-r-kj", tcpProxies: { "6379": {} } };
  const PostgresGTeP = postgres("Postgres-GTeP", { region: "us-west2" });
  PostgresGTeP.networking = { privateNetworkEndpoint: "postgres-gtep", tcpProxies: { "5432": {} } };
  const redisVolumeQ5B4 = volume("redis-volume-q5B4", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const postgresVolumeTPqU = volume("postgres-volume-TPqU", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 50000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 50000 });
  const redisVolumeTGb4 = volume("redis-volume-TGb4", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const redisVolumeZ10h = volume("redis-volume-Z10h", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const communitysafeApi = service("communitysafe-api", {
    replicas: { "us-west2": 1 },
    // Carried over from the root railway.json, which `railway config pull`
    // does NOT capture — Config as Code is read at deploy time and none of it
    // is stored in the service's settings, so pulling gave a service with no
    // start command, no healthcheck and no preDeploy. Applying that as-is
    // would have stopped prisma migrate deploy from running and left the
    // service with nothing to start.
    startCommand: "npm run start:api",
    // scripts/prisma-deploy.sh is fresh-DB-safe and runs migrate deploy.
    preDeployCommand: ["bash scripts/prisma-deploy.sh"],
    healthcheckPath: "/health",
    healthcheckTimeout: 30,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: { BCRYPT_ROUNDS: preserve(), CORS_ORIGINS: preserve(), DATABASE_URL: preserve(), DATABASE_URL_UNPOOLED: preserve(), GIT_COMMIT_SHA: preserve(), GOOGLE_GENERATIVE_AI_API_KEY: preserve(), GROQ_API_KEY: preserve(), "Gemini API Key 3": preserve(), JWT_EXPIRES_IN: preserve(), JWT_SECRET: preserve(), LIVE_SHARE_BASE_URL: preserve(), NODE_ENV: preserve(), NODE_OPTIONS: preserve(), POSTGRES_PRISMA_URL: preserve(), POSTGRES_URL_NON_POOLING: preserve(), RAILPACK_DEPLOY_APT_PACKAGES: preserve(), REDIS_URL: preserve(), SOCRATA_APP_TOKEN: preserve(), VAPID_PRIVATE_KEY: preserve(), VAPID_PUBLIC_KEY: preserve(), VAPID_SUBJECT: preserve(), WARM_WORKER_ENABLED: preserve() },
  });

  return project("CommunitySafe", {
    resources: [communitysafeApi, RedisRKj, PostgresGTeP, redisVolumeQ5B4, postgresVolumeTPqU, postgresVolume, redisVolumeTGb4, redisVolume, redisVolumeZ10h],
  });
});
