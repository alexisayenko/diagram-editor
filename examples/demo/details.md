# Demo infrastructure details

## Web Servers

Public entry point; both nodes sit behind a load balancer on 203.0.113.0/24.

## web-01.example.test

| Key | Value |
|---|---|
| OS | Ubuntu 24.04 |
| Confluence | [web-01](https://wiki.example.test/display/DEMO/web-01) |
| CPU / RAM | 4 vCPU / 8 GB |

- nginx reverse proxy for the customer portal

## web-02.example.test

| Key | Value |
|---|---|
| OS | Ubuntu 18.04 |
| Confluence | [web-02](https://wiki.example.test/display/DEMO/web-02) |

## Interface Servers

DMZ hosts for partner file exchange.

## ifc-01.example.test

| Key | Value |
|---|---|
| OS | Windows Server 2012 R2 |
| Confluence | [ifc-01](https://wiki.example.test/display/DEMO/ifc-01) |

- SFTP gateway on 198.51.100.20
- Job 104 pulls batch files and hands them to app-03

## Application Servers

## app-01.example.test

| Key | Value |
|---|---|
| OS | Oracle Linux 8 |
| Confluence | [app-01](https://wiki.example.test/display/DEMO/app-01) |

## app-02.example.test

| Key | Value |
|---|---|
| OS | Oracle Linux 8 |

## app-03.example.test

| Key | Value |
|---|---|
| OS | CentOS 7 |
| Confluence | [app-03](https://wiki.example.test/display/DEMO/app-03) |

- Job 104 batch import
- Job 210 nightly export to nas-01

## Cache Servers

Proposed tier, no hosts yet.

## Oracle DB Cluster

Three-node RAC; clients connect to the cluster service name.

## db-01.example.test

| Key | Value |
|---|---|
| OS | Oracle Linux 7 |

## db-02.example.test

| Key | Value |
|---|---|
| OS | Oracle Linux 7 |

## db-03.example.test

| Key | Value |
|---|---|
| OS | Oracle Linux 9 |

## Mongo DB Servers

## mongo-01.example.test

| Key | Value |
|---|---|
| OS | Debian 12 |

## NAS

## nas-01.example.test

| Key | Value |
|---|---|
| OS | TBD |

## stats-01.example.test

| Key | Value |
|---|---|
| OS | Debian 13 |
| Confluence | <https://wiki.example.test/display/DEMO/stats-01> |
