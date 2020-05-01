FROM node:10
MAINTAINER kumavis

# setup app dir
RUN mkdir -p /www/
WORKDIR /www/

# install dependencies
COPY ./package.json /www/package.json
RUN yarn install

# copy over app dir
COPY ./src /www/src
COPY ./build /www/build
COPY ./config.js /www/config.js

# start server
CMD yarn start

# expose server
EXPOSE 9000
