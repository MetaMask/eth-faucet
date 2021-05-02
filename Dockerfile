FROM node:14

# setup app dir
RUN mkdir -p /www/
WORKDIR /www/

# install dependencies
COPY .yarnrc yarn.lock package.json patches/ /www/
RUN yarn setup

# copy over app dir and build
COPY config.js src/ /www/
RUN yarn build

# start server
CMD yarn start

# expose server
EXPOSE 9000
