FROM golang:1.27-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

FROM alpine:3.24
RUN apk --no-cache upgrade && apk --no-cache add ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /server .
EXPOSE 8080
CMD ["./server"]
