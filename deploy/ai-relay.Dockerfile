FROM alpine:3.22
RUN apk add --no-cache openssh-client && adduser -D -u 1000 relay
ENTRYPOINT ["ssh"]
