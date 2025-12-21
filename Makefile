up.dev:
	docker compose -f docker-compose.dev.yml up -d

down.dev:
	docker compose -f docker-compose.dev.yml down

up.prod:
	docker compose -f docker-compose.yml up -d

down.prod:
	docker compose -f docker-compose.yml down

health:
	@curl -sf http://localhost:3000/api/health >/dev/null && echo 'ok' || echo 'health check failed'

logs.backend:
	docker logs -f apoj_backend_dev

logs.frontend:
	docker logs -f apoj_frontend_dev

logs.all:
	docker compose -f docker-compose.dev.yml logs -f

