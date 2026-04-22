FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN corepack enable
RUN npm ci --workspace @bizgital-marketing-report/frontend

COPY apps/frontend ./apps/frontend

RUN npm run build --workspace @bizgital-marketing-report/frontend

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "@bizgital-marketing-report/frontend"]
