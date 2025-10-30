# DeFi Markets Backend

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

<p align="center">A progressive <a href="http://nodejs.org" target="blank">Node.js</a> framework for building efficient and scalable server-side applications, heavily inspired by <a href="https://angular.io" target="blank">Angular</a>.</p>

<p align="center">
<a href="https://www.npmjs.com/~nestjscore"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://travis-ci.org/msanvarov/nest-rest-mongo-boilerplate"><img src="https://travis-ci.org/msanvarov/nest-rest-mongo-boilerplate.svg?branch=master" alt="Travis" /></a>
<a href="https://paypal.me/kamilmysliwiec"><img src="https://img.shields.io/badge/Donate-PayPal-dc3d53.svg"/></a>
<a href="https://twitter.com/nestframework"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
    
### 📚 Description

DeFi Markets Backend is a robust API built with NestJS for managing decentralized finance market data and user profiles. It comes with database, logging, security, and authentication features out of the box.


**Features:**
- User authentication and authorization
- Profile management
- JWT token-based security
- MongoDB integration with Mongoose
- Swagger API documentation
- Winston logging
- Rate limiting and security headers

---

### 🛠️ Prerequisites

#### Non Docker

- Please make sure to either have MongoDB Community installed locally or a subscription to Mongo on the cloud by configuration a cluster in [atlas](https://www.mongodb.com/cloud/atlas). 

#### Docker 🐳

- Please make sure to have docker desktop setup on any preferred operating system to quickly compose the required dependencies. Then follow the docker procedure outlined below.

**Note**: Docker Desktop comes free on both Mac and Windows, but it only works with Windows 10 Pro. A workaround is to get [Docker Toolbox](https://docs.docker.com/toolbox/toolbox_install_windows/) which will bypass the Windows 10 Pro prerequisite by executing in a VM.

---

### 🚀 Quick Start

#### Manual Deployment without Docker

1. **Clone the repository**
```bash
git clone <repository-url>
cd defi-markets-BE
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
```

3. **Set up environment variables**
   - Create a `.env` file in the root directory
   - Use the following template:

```env
# Application Environment
APP_ENV=dev

# Application URL
APP_URL=http://localhost:3000

# JWT Configuration
WEBTOKEN_SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
WEBTOKEN_EXPIRATION_TIME=1800

# Database Configuration
DB_URL=mongodb://localhost:27017/defi-markets
```

4. **Start MongoDB**
   - Install MongoDB locally, or
   - Use Docker: `docker run -d -p 27017:27017 --name mongodb mongo:latest`

5. **Start the application**
```bash
# Development mode
npm run start:dev

# Production mode
npm run start
```

The application will be available at **http://localhost:3000**

#### Deploying with Docker 🐳

- Execute the following command in-app directory:

```bash
# creates and loads the docker container with required configuration
$ docker-compose up -d 
```
- The following command will set up and run the docker project for quick use. Then the web application, and MongoDB will be exposed to http://localhost:3000 and http://localhost:27017 respectively.

---

### 🔒 Environment Configuration

By default, the application comes with a config module that can read in every environment variable from the `.env` file.

**APP_ENV** - the application environment to execute as, either in development or production. Determines the type of logging options to utilize. Options: `dev` or `prod`. 

**APP_URL** - the base URL for the application. Made mainly to showcase the power of `ConfigService` and can be removed as it doesn't serve any other purpose

**WEBTOKEN_SECRET_KEY** - the secret key to encrypt/decrypt web tokens with. Make sure to generate a random alphanumeric string for this.

**WEBTOKEN_EXPIRATION_TIME** - **the time in seconds** indicating when the web token will expire; by default, it's 1800 seconds which is 30 mins.

**DB_URL** - the URL to the MongoDB collection

---

### 🔧 Recent Fixes

The following issues have been resolved in this version:

1. **Missing .env file** - Created default environment configuration
2. **Port conflict** - Changed default port from 9000 to 3000 to avoid conflicts with other services
3. **Mongoose compatibility** - Updated `nModified` to `modifiedCount` for newer Mongoose versions
4. **TypeScript compilation** - Fixed type errors in profile service

---

### 🏗 Choosing a Web Framework

This boilerplate comes with [Fastify](https://github.com/fastify/fastify) out of the box as it offers [performance benefits](https://github.com/nestjs/nest/blob/master/benchmarks/all_output.txt) over Express. But this can be changed to use [Express](https://expressjs.com/) framework instead of Fastify. 

For interchangeability:

- Replace the following lines of code in the [main.ts file](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/main.ts) with the ones detailed below.

Fastify:

```ts
// for fastify:
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as headers from 'fastify-helmet';
import * as fastifyRateLimiter from 'fastify-rate-limit';
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: console }),
);
app.register(headers);
app.register(fastifyRateLimiter, {
  max: 100,
  timeWindow: '1 minute',
});
```

Express:

```ts
// for express:
import * as headers from 'helmet';
import * as rateLimiter from 'express-rate-limit';
const app = await NestFactory.create(AppModule, {
  logger: console,
});
app.use(headers());
app.use(
  rateLimiter({
    windowMs: 60, // 1 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  }),
);
```

**Note**: The boilerplate comes with production dependencies for both Express and Fastify to support moving between two. But this is going to leave it bloated especially when only **one web framework is used at a time**. Thus, **it is recommended that when deploying to production, unused dependencies are purged.** 

If you choose to **use Fastify**, this command will **purge all of the Express dependencies**:

```bash
# removing Express dependencies
$ npm rm @nestjs/platform-express express-rate-limit helmet swagger-ui-express @types/express --save
```

If you choose to **use Express**, this command will **purge all of the Fastify dependencies**:

```bash
# removing Fastify dependencies
$ npm rm @nestjs/platform-fastify fastify-helmet fastify-rate-limit fastify-swagger --save
```

---

### ✅ Testing

#### Docker 🐳

```bash
# unit tests
$ docker exec -it nest yarn test

# e2e tests
$ docker exec -it nest yarn test:e2e

# test coverage
$ docker exec -it nest yarn test:cov
```

#### Non-Docker

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

---

### 💡 TypeDocs

The documentation for this boilerplate can be found [on Github pages](https://msanvarov.github.io/nest-rest-mongo-boilerplate/).

The docs can be generated on-demand, simply, by typing `npm run typedocs`. This will produce a **docs** folder with the required front-end files and **start hosting on [localhost](http://localhost:8080)**.

```bash
# generate docs for code
$ npm run typedocs
```

---

### 📝 Open API

Out of the box, the web app comes with Swagger; an [open api specification](https://swagger.io/specification/), that is used to describe RESTful APIs. Nest provides a [dedicated module to work with it](https://docs.nestjs.com/recipes/swagger).

The configuration for Swagger can be found at this [location](https://github.com/msanvarov/nest-rest-mongo-boilerplate/tree/master/src/swagger).

**API Documentation**: Once the application is running, visit `http://localhost:3000/api/docs` to view the interactive API documentation.

---

### ✨ Mongoose

Mongoose provides a straight-forward, schema-based solution to model your application data. It includes built-in type casting, validation, query building, business logic hooks and more, out of the box. Please view the [documentation](https://mongoosejs.com) for further details.

The configuration for Mongoose can be found in the [app module](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/modules/app/app.module.ts#L17).

---

### 🔊 Logs

This boilerplate comes with an integrated Winston module for logging, the configurations for Winston can be found in the [app module](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/modules/app/app.module.ts#L27).

---

### 🚨 Troubleshooting

**Port already in use**: If you encounter port conflicts, you can change the port in `src/main.ts` or kill the process using the port:
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

**MongoDB connection issues**: Ensure MongoDB is running and accessible at the URL specified in your `.env` file.

**Environment variables**: Make sure all required environment variables are set in your `.env` file.

---

### 👥 Contribution

PRs are appreciated, I fully rely on the passion ❤️ of the OS developers.

---

## License

Nest is [MIT licensed](LICENSE).

[Author](https://sal-anvarov.com/)

