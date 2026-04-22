FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/package.json

RUN corepack enable
RUN npm ci --workspace @bizgital-marketing-report/backend

COPY apps/backend ./apps/backend

RUN npm run build --workspace @bizgital-marketing-report/backend

EXPOSE 3003

CMD ["npm", "run", "start", "--workspace", "@bizgital-marketing-report/backend"]
