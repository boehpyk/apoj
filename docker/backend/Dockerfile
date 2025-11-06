FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /workspace/packages/backend
ENV PNPM_HOME=/pnpm
ENV CI=true
RUN corepack enable
COPY . /workspace
RUN pnpm install --filter backend --ignore-scripts --no-frozen-lockfile
EXPOSE 3000 9229
CMD ["pnpm","run","dev"]

