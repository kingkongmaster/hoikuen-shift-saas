FROM postgres:16-alpine AS backup-tools
RUN apk add --no-cache age python3 && rm -rf /usr/local/lib/postgresql/pgxs/src/test

# Export the cleaned tool filesystem so inherited PostgreSQL test assets are absent in every shipped layer.
FROM scratch
COPY --from=backup-tools / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=en_US.utf8
COPY backup.sh retention.sh offhost-copy.sh check-status.sh status.py lib.sh /opt/aen-shift/backup/
RUN chmod 755 /opt/aen-shift/backup/backup.sh /opt/aen-shift/backup/retention.sh /opt/aen-shift/backup/offhost-copy.sh /opt/aen-shift/backup/check-status.sh
ENTRYPOINT ["/opt/aen-shift/backup/backup.sh"]
