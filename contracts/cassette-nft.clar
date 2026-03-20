(trait-of sip009-nft)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-TOKEN-NOT-FOUND (err u101))

(define-data-var contract-owner principal tx-sender)
(define-data-var last-token-id uint u0)

(define-non-fungible-token cassette uint)

(define-map token-uris
  { token-id: uint }
  { uri: (string-ascii 256) }
)

(define-private (token-exists (token-id uint))
  (is-some (nft-get-owner? cassette token-id))
)

(define-public (mint (recipient principal) (token-uri (optional (string-ascii 256))))
  (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
  (let
    (
      (next-token-id (+ (var-get last-token-id) u1))
    )
    (begin
      (try! (nft-mint? cassette next-token-id recipient))
      (var-set last-token-id next-token-id)
      (match token-uri
        uri (map-set token-uris { token-id: next-token-id } { uri: uri })
        true
      )
      (print {
        event: "cassette-minted",
        token-id: next-token-id,
        recipient: recipient
      })
      (ok next-token-id)
    )
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
  (begin
    (try! (nft-transfer? cassette token-id sender recipient))
    (print {
      event: "cassette-transferred",
      token-id: token-id,
      sender: sender,
      recipient: recipient
    })
    (ok true)
  )
)

(define-public (set-token-uri (token-id uint) (uri (string-ascii 256)))
  (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
  (asserts! (token-exists token-id) ERR-TOKEN-NOT-FOUND)
  (begin
    (map-set token-uris { token-id: token-id } { uri: uri })
    (print {
      event: "cassette-uri-set",
      token-id: token-id
    })
    (ok true)
  )
)

(define-public (set-contract-owner (new-owner principal))
  (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
  (var-set contract-owner new-owner)
  (print {
    event: "contract-owner-updated",
    owner: new-owner
  })
  (ok true)
)

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
  (response (optional (string-ascii 256)) uint)
  (ok
    (match (map-get? token-uris { token-id: token-id })
      record (some (get uri record))
      none
    )
  )
)

(define-read-only (get-owner (token-id uint))
  (response (optional principal) uint)
  (ok (nft-get-owner? cassette token-id))
)

(define-read-only (get-owner-principal)
  (ok (var-get contract-owner))
)
