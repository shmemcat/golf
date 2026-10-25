# syntax=docker/dockerfile:1
# Keep dependencies separate so CI can warm this stage for release tags.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=fontawesome_token,env=FONTAWESOME_PACKAGE_TOKEN,required=true npm ci --prefer-offline --no-audit --no-fund
FROM dependencies AS builder
COPY . .
ENV VITE_BASE_PATH=/golf/ VITE_ACCOUNT_API_URL=/api/account VITE_CARDS_HOME_URL=https://cards.shmem.dev/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q --spider http://127.0.0.1:3003/ || exit 1
