FROM node:20-alpine
WORKDIR /app

# Accept build argument for algorithm tag (P1 or P2)
ARG ALGO=P1
ENV ALGORITHM_VERSION=$ALGO

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 5005
CMD ["npm", "start"]
