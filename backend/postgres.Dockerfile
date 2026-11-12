FROM postgres:17-alpine

# Replace the bundled Go-based gosu and its vulnerable embedded dependencies.
RUN apk --no-cache upgrade \
    && apk --no-cache add su-exec \
    && rm /usr/local/bin/gosu \
    && sed -i 's/exec gosu /exec su-exec /g' \
        /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-ensure-initdb.sh \
    && su-exec postgres sh -c 'test "$(id -u)" = "$(id -u postgres)"'
