FROM python:3.12-alpine

RUN apk add --no-cache bash ca-certificates curl docker-cli docker-cli-compose git openssh-client rsync util-linux
WORKDIR /service
COPY reid_host_ops.py ./reid_host_ops.py
RUN addgroup -S reidops && adduser -S -G reidops reidops \
  && mkdir -p /var/lib/reid-host-ops \
  && chown -R reidops:reidops /service /var/lib/reid-host-ops

# Root is deliberate: execution enters the host namespaces only after an
# authenticated Owner preview has been confirmed and recorded by Reid.
EXPOSE 8787
HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["python", "-B", "reid_host_ops.py"]
