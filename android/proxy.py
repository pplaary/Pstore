"""TCP proxy: 0.0.0.0:3088 -> 127.0.0.1:3080"""
import socket
import threading
import sys

def handle_client(client_sock, addr):
    try:
        server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_sock.connect(("127.0.0.1", 3080))
        
        def forward(src, dst):
            try:
                while True:
                    data = src.recv(8192)
                    if not data:
                        break
                    dst.sendall(data)
            except:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_WR)
                except:
                    pass
        
        t1 = threading.Thread(target=forward, args=(client_sock, server_sock))
        t2 = threading.Thread(target=forward, args=(server_sock, client_sock))
        t1.daemon = True
        t2.daemon = True
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            client_sock.close()
        except:
            pass

def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", 3088))
    s.listen(50)
    print("Proxy listening on 0.0.0.0:3088 -> 127.0.0.1:3080")
    while True:
        client, addr = s.accept()
        threading.Thread(target=handle_client, args=(client, addr), daemon=True).start()

if __name__ == "__main__":
    main()
