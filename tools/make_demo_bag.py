#!/usr/bin/env python3
"""Erzeugt die Beispielaufnahme bags/raumfahrt.mcap für ROS2Sim.

Ein Knoten simuliert einen TurtleBot3-ähnlichen Roboter in einem Raum (6 m x 4 m
mit einer Kiste) und veröffentlicht wie der echte Roboter:

  /scan        sensor_msgs/msg/LaserScan   10 Hz, 360 Strahlen, Rahmen base_scan
  /odom        nav_msgs/msg/Odometry       20 Hz, odom -> base_footprint
  /tf          tf2_msgs/msg/TFMessage      20 Hz, odom -> base_footprint
  /tf_static   tf2_msgs/msg/TFMessage      base_footprint -> base_link -> base_scan

Aufnehmen (ROS 2 Jazzy):
  python3 tools/make_demo_bag.py &
  ros2 bag record --topics /scan /odom /tf /tf_static -o raumfahrt

Die Welt ist erfunden, die Bagdatei entsteht aber mit dem echten rosbag2.

Autoren: Sebastian Zug & Claude Code (Opus 5.5) mit LiaScript Teaching-Agent
"""
import math

import rclpy
from geometry_msgs.msg import TransformStamped
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import LaserScan
from tf2_msgs.msg import TFMessage

# Wände des Raums und eine Kiste als Strecken (x1, y1, x2, y2) im Rahmen odom
SEGMENTS = [
    (-1.0, -1.5, 5.0, -1.5), (5.0, -1.5, 5.0, 2.5), (5.0, 2.5, -1.0, 2.5), (-1.0, 2.5, -1.0, -1.5),
    (2.4, 0.3, 3.0, 0.3), (3.0, 0.3, 3.0, 0.9), (3.0, 0.9, 2.4, 0.9), (2.4, 0.9, 2.4, 0.3),
]
SCAN_OFFSET = (-0.032, 0.0)  # base_scan relativ zu base_footprint (TurtleBot3 Burger)


def ray(px, py, a, rmax):
    """Abstand vom Punkt (px, py) in Richtung a bis zur nächsten Strecke."""
    dx, dy = math.cos(a), math.sin(a)
    best = math.inf
    for x1, y1, x2, y2 in SEGMENTS:
        ex, ey = x2 - x1, y2 - y1
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        t = ((x1 - px) * ey - (y1 - py) * ex) / den
        u = ((x1 - px) * dy - (y1 - py) * dx) / den
        if t > 0 and 0 <= u <= 1:
            best = min(best, t)
    return best if best <= rmax else math.inf


def quat(yaw):
    return (0.0, 0.0, math.sin(yaw / 2), math.cos(yaw / 2))


class DemoRobot(Node):
    def __init__(self):
        super().__init__('demo_turtlebot')
        self.scan_pub = self.create_publisher(LaserScan, 'scan', QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT))
        self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
        self.tf_pub = self.create_publisher(TFMessage, 'tf', 10)
        static_qos = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL)
        self.static_pub = self.create_publisher(TFMessage, 'tf_static', static_qos)
        self.t0 = self.get_clock().now()
        self.x, self.y, self.yaw = 0.0, 0.0, 0.0
        self.static_sent = False
        self.create_timer(0.05, self.step)
        self.create_timer(0.1, self.scan)
        self.create_timer(0.5, self.send_static)

    def send_static(self):
        # erst senden, wenn der Recorder sicher abonniert hat; transient_local hält die Nachricht vor
        if self.static_sent:
            return
        now = self.get_clock().now().to_msg()
        tfs = []
        for parent, child, (x, y, z) in [('base_footprint', 'base_link', (0.0, 0.0, 0.010)),
                                         ('base_link', 'base_scan', (-0.032, 0.0, 0.172))]:
            t = TransformStamped()
            t.header.stamp = now
            t.header.frame_id = parent
            t.child_frame_id = child
            t.transform.translation.x, t.transform.translation.y, t.transform.translation.z = x, y, z
            t.transform.rotation.w = 1.0
            tfs.append(t)
        self.static_pub.publish(TFMessage(transforms=tfs))
        self.static_sent = True

    def pose_at(self, s):
        # Fahrt: geradeaus, im Bogen um die Kiste, zurück – ein geschlossener Rundkurs
        v, w = 0.22, 0.0
        if 4.0 < s % 24 < 10.0:
            w = 0.5
        elif 14.0 < s % 24 < 20.0:
            w = 0.55
        return v, w

    def step(self):
        s = (self.get_clock().now() - self.t0).nanoseconds * 1e-9
        v, w = self.pose_at(s)
        dt = 0.05
        self.yaw += w * dt
        self.x += v * math.cos(self.yaw) * dt
        self.y += v * math.sin(self.yaw) * dt
        now = self.get_clock().now().to_msg()
        q = quat(self.yaw)
        odom = Odometry()
        odom.header.stamp = now
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_footprint'
        odom.pose.pose.position.x, odom.pose.pose.position.y = self.x, self.y
        (odom.pose.pose.orientation.x, odom.pose.pose.orientation.y,
         odom.pose.pose.orientation.z, odom.pose.pose.orientation.w) = q
        odom.twist.twist.linear.x, odom.twist.twist.angular.z = v, w
        self.odom_pub.publish(odom)
        t = TransformStamped()
        t.header.stamp = now
        t.header.frame_id = 'odom'
        t.child_frame_id = 'base_footprint'
        t.transform.translation.x, t.transform.translation.y = self.x, self.y
        t.transform.rotation.x, t.transform.rotation.y, t.transform.rotation.z, t.transform.rotation.w = q
        self.tf_pub.publish(TFMessage(transforms=[t]))

    def scan(self):
        msg = LaserScan()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'base_scan'
        msg.angle_min, msg.angle_max = 0.0, 2 * math.pi - math.radians(1)
        msg.angle_increment = math.radians(1)
        msg.scan_time = 0.1
        msg.range_min, msg.range_max = 0.12, 3.5
        sx = self.x + SCAN_OFFSET[0] * math.cos(self.yaw)
        sy = self.y + SCAN_OFFSET[0] * math.sin(self.yaw)
        ranges = []
        for i in range(360):
            r = ray(sx, sy, self.yaw + math.radians(i), msg.range_max)
            # leichtes Messrauschen, deterministisch
            ranges.append(r + 0.004 * math.sin(i * 12.9898 + s_hash(self.x, self.y)) if math.isfinite(r) else math.inf)
        msg.ranges = ranges
        self.scan_pub.publish(msg)


def s_hash(x, y):
    return (x * 78.233 + y * 37.719) % 6.283


def main():
    rclpy.init()
    rclpy.spin(DemoRobot())


if __name__ == '__main__':
    main()
