FROM node:10
MAINTAINER kumavis

# setup app dir
RUN mkdir -p /www/
WORKDIR /www/

# install dependencies
COPY ./package.json /www/package.json
COPY ./patches /www/patches
RUN yarn install --production

# copy over app dir
COPY ./src /www/src
COPY ./build /www/build
COPY ./config.js /www/config.js

# copy over lavamoat permissions
COPY ./lavamoat-config.json /www/lavamoat-config.json
COPY ./lavamoat-config-override.json /www/lavamoat-config-override.json

# start server
CMD yarn start

# expose server
EXPOSE 9000
