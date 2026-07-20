FROM node:24-alpine AS build

COPY idp/example1/package*.json /examples/idp/
COPY rp/example1/package*.json /examples/rp/
COPY as/example1/package*.json /examples/as/
COPY as/example2/package*.json /examples/as2/
COPY external_crypto_service/example1/package*.json /examples/dpki/
COPY rp/example1/frontend/package*.json /examples/frontend/

RUN cd /examples/idp && npm install && \
    cd /examples/rp && npm install && \
    cd /examples/as && npm install && \
    cd /examples/as2 && npm install && \
    cd /examples/dpki && npm install && \
    cd /examples/frontend && npm install


FROM node:24-alpine

ENV TERM=xterm-256color

RUN apk update && apk add --no-cache bash openssl curl

WORKDIR /examples

COPY idp/example1 /examples/idp
COPY rp/example1 /examples/rp
COPY as/example1 /examples/as
COPY as/example2 /examples/as2
COPY external_crypto_service/example1 /examples/dpki
COPY rp/example1/frontend /examples/frontend
COPY test/mock-ndid-api.js /examples/mock/mock-ndid-api.js

COPY docker/start-node.sh /examples

COPY --from=build /examples/idp/node_modules /examples/idp/node_modules
COPY --from=build /examples/rp/node_modules /examples/rp/node_modules
COPY --from=build /examples/as/node_modules /examples/as/node_modules
COPY --from=build /examples/as2/node_modules /examples/as2/node_modules
COPY --from=build /examples/dpki/node_modules /examples/dpki/node_modules
COPY --from=build /examples/frontend/node_modules /examples/frontend/node_modules

ENTRYPOINT ["./start-node.sh"]
