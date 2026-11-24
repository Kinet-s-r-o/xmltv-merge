package dvb

import (
	"fmt"
	"net"

	"golang.org/x/net/ipv4"
)

// MulticastSender writes UDP datagrams to one multicast group.
type MulticastSender struct {
	conn *ipv4.PacketConn
	raw  net.PacketConn
	dst  *net.UDPAddr
}

// ResolveInterface finds a network interface by name or by one of its IPv4
// addresses. An empty value returns nil (system routing decides).
func ResolveInterface(value string) (*net.Interface, error) {
	if value == "" {
		return nil, nil
	}
	if ip := net.ParseIP(value); ip != nil {
		ifaces, err := net.Interfaces()
		if err != nil {
			return nil, err
		}
		for i := range ifaces {
			addrs, _ := ifaces[i].Addrs()
			for _, a := range addrs {
				if n, ok := a.(*net.IPNet); ok && n.IP.Equal(ip) {
					return &ifaces[i], nil
				}
			}
		}
		return nil, fmt.Errorf("no network interface has address %s", value)
	}
	iface, err := net.InterfaceByName(value)
	if err != nil {
		return nil, fmt.Errorf("network interface %q: %w", value, err)
	}
	return iface, nil
}

// DialMulticast opens a UDP socket for sending to address:port with the
// given TTL, outgoing interface (name or IPv4 address) and loopback.
func DialMulticast(address string, port, ttl int, iface string, loopback bool) (*MulticastSender, error) {
	ip := net.ParseIP(address).To4()
	if ip == nil {
		return nil, fmt.Errorf("invalid multicast address %q", address)
	}
	ifi, err := ResolveInterface(iface)
	if err != nil {
		return nil, err
	}
	raw, err := net.ListenPacket("udp4", "0.0.0.0:0")
	if err != nil {
		return nil, err
	}
	conn := ipv4.NewPacketConn(raw)
	fail := func(step string, err error) (*MulticastSender, error) {
		raw.Close()
		return nil, fmt.Errorf("%s: %w", step, err)
	}
	if err := conn.SetMulticastTTL(ttl); err != nil {
		return fail("set multicast TTL", err)
	}
	if ifi != nil {
		if err := conn.SetMulticastInterface(ifi); err != nil {
			return fail("set multicast interface", err)
		}
	}
	if err := conn.SetMulticastLoopback(loopback); err != nil {
		return fail("set multicast loopback", err)
	}
	return &MulticastSender{conn: conn, raw: raw, dst: &net.UDPAddr{IP: ip, Port: port}}, nil
}

// Send writes one datagram.
func (s *MulticastSender) Send(b []byte) error {
	_, err := s.conn.WriteTo(b, nil, s.dst)
	return err
}

// Close closes the socket.
func (s *MulticastSender) Close() error { return s.raw.Close() }
