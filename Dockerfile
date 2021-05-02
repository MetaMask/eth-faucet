FROM node:14

# setup app dir
RUN mkdir -p /www/
WORKDIR /www/

# install dependencies
COPY .yarnrc yarn.lock package.json patches/ /www/
RUN yarn setup

# copy over app dir
COPY ./src /www/src
COPY ./build /www/build
COPY ./config.js /www/config.js

# start server
CMD yarn start

# expose server
EXPOSE 9000
