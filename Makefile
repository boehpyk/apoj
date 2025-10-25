up.dev:
	docker compose -f docker-compose.dev.yml up --build

down.dev:
	docker compose -f docker-compose.dev.yml down

up.prod:
	docker compose -f docker-compose.yml up --build

down.prod:
	docker compose -f docker-compose.yml down

