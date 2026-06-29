import socket, threading, sys

def handle(conn):
    data = conn.recv(4096)
    print(f"GOT: {data[:200]}")
    resp = b"HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\nHELLO FROM HOST"
    conn.send(resp)
    conn.close()

s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("0.0.0.0", 3099))
s.listen(1)
print("LISTENING on 0.0.0.0:3099")
s.settimeout(5)
try:
    conn, addr = s.accept()
    print(f"CONN from {addr}")
    handle(conn)
except socket.timeout:
    print("TIMEOUT")
s.close()
