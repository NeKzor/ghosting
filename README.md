# ghosting

[GhostServer][p2sr-GhostServer] alternative for SourceAutoRecord.

[p2sr-GhostServer]: https://github.com/p2sr/GhostServer

- [Status](#status)
- [Protocol](#protocol)
  - [Header](#header)
  - [Connect](#connect)
    - [connection_packet](#connection_packet)
    - [confirm_connection_packet](#confirm_connection_packet)
    - [connect_packet](#connect_packet)
  - [Disconnect](#connect)
    - [disconnect_packet](#disconnect_packet)
  - [Ping](#ping)
    - [ping_packet](#ping_packet)
    - [ping_echo_packet](#ping_echo_packet)
  - [Map Change](#map_change)
    - [map_change_packet](#map_change_packet)
  - [Message](#message)
    - [message_packet](#message_packet)
  - [Countdown](#countdown)
    - [countdown_packet](#countdown_packet)
    - [confirm_countdown_packet](#confirm_countdown_packet)
  - [Speedrun Finish](#speedrun-finish)
    - [speedrun_finish_packet](#speedrun_finish_packet)
  - [Model Change](#model-change)
    - [model_change_packet](#model_change_packet)
  - [Color Change](#color-change)
    - [color_change_packet](#color_change_packet)
- [Structs](#structs)
  - [GhostEntity](#ghostentity)
  - [Color](#color)
  - [Vector](#vector)
  - [DataGhost](#dataghost)
- [License](#license)

## Status

### TODO

- [x] Ping
- [x] Connect
- [x] Disconnect
- [ ] Stop Server
- [x] Map Change
- [ ] Heart Beat
- [x] Message
- [x] Countdown
- [ ] Update
- [x] Speedrun Finish
- [x] Model Change
- [x] Color Change

### Notes

- ID is not a unique identifier
- Header value gets ignored when starting a connection
- Questionable `STOP_SERVER` implementation
- Disconnect is checked by IP
- Time in `SPEEDRUN_FINISH` is formatted and send as string

## Protocol

### Header

| Name                                | Value |
| ----------------------------------- | ----- |
| NONE                                | 0     |
| [PING](#ping)                       | 1     |
| [CONNECT](#connect)                 | 2     |
| [DISCONNECT](#disconnect)           | 3     |
| STOP_SERVER                         | 4     |
| [MAP_CHANGE](#map-change)           | 5     |
| HEART_BEAT                          | 6     |
| [MESSAGE](#message)                 | 7     |
| [COUNTDOWN](#countdown)             | 8     |
| UPDATE                              | 9     |
| [SPEEDRUN_FINISH](#speedrun-finish) | 10    |
| [MODEL_CHANGE](#model-change)       | 11    |
| [COLOR_CHANGE](#color-change)       | 12    |

### Connect

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: connection_packet

    Server->>Client: confirm_connection_packet
    Server->>Clients: connect_packet (broadcast)
```

#### connection_packet

| Field             | Type                    | Description |
| ----------------- | ----------------------- | ----------- |
| [header](#header) | u8                      | `CONNECT`   |
| port              | u32                     |             |
| name              | CString                 |             |
| data              | [DataGhost](#dataghost) |             |
| model_name        | CString                 |             |
| level_name        | CString                 |             |
| tcp_only          | bool                    |             |
| color             | [Color](#color)         |             |
| spectator         | bool                    |             |

#### confirm_connection_packet

| Field     | Type                           | Description |
| --------- | ------------------------------ | ----------- |
| id        | u32                            |             |
| nb_ghosts | u32                            |             |
| ghosts    | [GhostEntity[]](#ghost-entity) |             |

#### connect_packet

| Field             | Type                    | Description |
| ----------------- | ----------------------- | ----------- |
| [header](#header) | u8                      | `CONNECT`   |
| id                | u32                     |             |
| name              | CString                 |             |
| data              | [DataGhost](#dataghost) |             |
| model_name        | CString                 |             |
| level_name        | CString                 |             |
| tcp_only          | bool                    |             |
| color             | [Color](#color)         |             |
| spectator         | bool                    |             |

### Disconnect

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: disconnect_packet

    Server->>Clients: disconnect_packet (broadcast)
```

#### disconnect_packet

| Field             | Type | Description  |
| ----------------- | ---- | ------------ |
| [header](#header) | u8   | `DISCONNECT` |
| id                | u32  |              |

### Ping

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord

    Client->>Server: ping_packet

    Server->>Client: ping_echo_packet
```

#### ping_packet

| Field             | Type | Description |
| ----------------- | ---- | ----------- |
| [header](#header) | u8   | `PING`      |
| id                | u32  |             |

#### ping_echo_packet

| Field             | Type | Description |
| ----------------- | ---- | ----------- |
| [header](#header) | u8   | `PING`      |

### Map Change

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: map_change_packet

    Server->>Clients: map_change_packet
```

#### map_change_packet

| Field             | Type    | Description  |
| ----------------- | ------- | ------------ |
| [header](#header) | u8      | `MAP_CHANGE` |
| id                | u32     |              |
| map_name          | CString |              |
| ticks             | u32     |              |
| tick_total        | u32     |              |

### Message

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: message_packet

    Server->>Clients: message_packet (broadcast)
```

#### message_packet

| Field             | Type    | Description |
| ----------------- | ------- | ----------- |
| [header](#header) | u8      | `MESSAGE`   |
| id                | u32     |             |
| message           | CString |             |

### Countdown

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord

    Server->>Clients: countdown_packet (broadcast)

    Client->>Server: confirm_countdown_packet
    Server->>Client: confirm_countdown_packet (id = 0)
```

#### countdown_packet

| Field             | Type    | Description |
| ----------------- | ------- | ----------- |
| [header](#header) | u8      | `COUNTDOWN` |
| id                | u32     | 0           |
| step              | u32     | 0           |
| duration          | u32     |             |
| pre_commands      | cstring |             |
| post_commands     | cstring |             |

#### confirm_countdown_packet

| Field             | Type | Description    |
| ----------------- | ---- | -------------- |
| [header](#header) | u8   | `COUNTDOWN`    |
| id                | u32  | Server sends 0 |
| step              | u32  | 1              |

### Speedrun Finish

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
  participant Clients

    Client->>Server: speedrun_finish_packet
    Server->>Clients: speedrun_finish_packet (broadcast)
```

#### speedrun_finish_packet

| Field             | Type    | Description       |
| ----------------- | ------- | ----------------- |
| [header](#header) | u8      | `SPEEDRUN_FINISH` |
| id                | u32     |                   |
| time              | cstring |                   |

### Model Change

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: model_change_packet
    Server->>Clients: model_change_packet (broadcast)
```

#### model_change_packet

| Field             | Type    | Description    |
| ----------------- | ------- | -------------- |
| [header](#header) | u8      | `MODEL_CHANGE` |
| id                | u32     |                |
| model_name        | cstring |                |

### Color Change

```mermaid
sequenceDiagram
    participant Server
    Note left of Server: ghost.portal2.sr
    participant Client
    Note right of Client: SourceAutoRecord
    participant Clients

    Client->>Server: color_change_packet
    Server->>Clients: color_change_packet (broadcast)
```

#### color_change_packet

| Field             | Type            | Description    |
| ----------------- | --------------- | -------------- |
| [header](#header) | u8              | `COLOR_CHANGE` |
| id                | u32             |                |
| color             | [Color](#color) |                |

## Structs

### GhostEntity

| Field       | Type                    | Description |
| ----------- | ----------------------- | ----------- |
| id          | u32                     |             |
| name        | CString                 |             |
| data        | [DataGhost](#dataghost) |             |
| model_name  | CString                 |             |
| current_map | CString                 |             |
| color       | [Color](#color)         |             |
| spectator   | bool                    |             |

### Color

| Field | Type | Description |
| ----- | ---- | ----------- |
| r     | u32  |             |
| g     | u32  |             |
| b     | u32  |             |

### Vector

| Field | Type | Description |
| ----- | ---- | ----------- |
| x     | f32  |             |
| y     | f32  |             |
| z     | f32  |             |

### DataGhost

| Field      | Type              | Description                |
| ---------- | ----------------- | -------------------------- |
| position   | [Vector](#vector) |                            |
| view_angle | [Vector](#vector) |                            |
| data       | u8                | Encoded fields, see below. |

##### Data

| Field       | Type | Description                |
| ----------- | ---- | -------------------------- |
| view_offset | f32  | `data & 0x7F` (bit 1 to 7) |
| grounded    | bool | `data & 0x80` (bit 8)      |

## License

[MIT License](./LICENSE)
