import { MessageError } from '@yurkimus/errors'
import * as message from '@yurkimus/message'
import { ResponseStatus } from '@yurkimus/response-status'

import {
  FeatureKinds,
  FeatureRequests,
  FeatureUrls,
  Kinds,
} from 'source/enumerations/features'

let handleMessage = (feature, [response, body]) => {
  switch (response.status) {
    case 200:
    case 201:
      return body

    case 204:
      switch (FeatureKinds[feature]) {
        case Kinds.Item:
          return null

        case Kinds.List:
          return []
      }

    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 415:
    case 500:
    case 502:
      throw MessageError(
        body.message,
        ResponseStatus(response.status),
      )

    default:
      throw body
  }
}

/**
 * @template {FeaturesUnion} Feature
 * @template {MethodsUnion} Method
 * @template {NetworksUnion} Network
 *
 * @param {Feature} feature
 * @param {Method} method
 * @param {Network} network
 * @param {import('@yurkimus/url').URLOptions} options
 * @param {RequestInit} init
 */
let makeRequest = (feature, method, network, options, init) => {
  if (!('method' in init))
    init.method = method

  let url = FeatureUrls
    .get(feature)
    .get(network)

  let request = new Request(url(options), init)

  if (!request.headers.has('Content-Type'))
    request.headers.set(
      'Content-Type',
      'application/json',
    )

  if (!request.headers.has('Authorization'))
    request.headers.set(
      'Authorization',
      cookies.read('Authorization', init.cookie),
    )

  return fetch(request)
    .then(message.read)
    .then(handleMessage.bind(undefined, feature))
}

/**
 * @type {WeakMap<Function, Record<'onbefore' | 'onfulfilled' | 'onrejected', Set<Function>>>
 */
export let Extensions = new WeakMap()

/**
 * @template {FeaturesUnion} Feature
 * @template {MethodsUnion} Method
 * @template {NetworksUnion} Network
 *
 * @param {Feature} feature
 * @param {Method} method
 * @param {Network} network
 */
export let useRequest = (feature, method, network) => {
  if (
    !FeatureRequests
      .has(feature)
  )
    throw TypeError(`Feature '${feature}' must be listed in 'FeatureRequests'.`)

  if (
    !FeatureRequests
      .get(feature)
      .has(method)
  )
    throw TypeError(`Method '${method}' must be listed in 'FeatureRequests'.`)

  if (
    !FeatureUrls
      .has(feature)
  )
    throw TypeError(`Feature '${feature}' must be listed in 'FeatureUrls'.`)

  if (
    !FeatureUrls
      .get(feature)
      .has(network)
  )
    throw TypeError(`Network '${network}' must be listed in 'FeatureUrls'.`)

  /**
   * @param {import('@yurkimus/url').URLOptions} options
   * @param {RequestInit} init
   */
  let request = (options, init) => {
    let onbefore = () =>
      Extensions
        .get(request)
        .onbefore
        .forEach(onbefore => onbefore())

    let onfulfilled = contract =>
      Extensions
        .get(request)
        .onfulfilled
        .forEach(onfulfilled => onfulfilled(contract))

    let onrejected = reason =>
      Extensions
        .get(request)
        .onrejected
        .forEach(onrejected => onrejected(reason))

    return Promise
      .resolve(onbefore)
      .then(makeRequest.bind(
        undefined,
        feature,
        method,
        network,
        options,
        init,
      ))
      .then(onfulfilled)
      .catch(onrejected)
  }

  Extensions.set(request, {
    onbefore: new Set(),
    onfulfilled: new Set(),
    onrejected: new Set(),
  })

  return request
}