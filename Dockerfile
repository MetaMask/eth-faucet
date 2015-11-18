FROM ethereum/client-go
MAINTAINER kumavis

# setup app dir
RUN mkdir -p /www/
WORKDIR /www/

# install dependencies
COPY ./package.json /www/package.json
RUN npm install

# copy over app dir
COPY ./ /www/

# run tests
RUN npm test

# start server
CMD npm start

# expose server
EXPOSE 9000
