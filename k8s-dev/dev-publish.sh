#!/bin/bash
set -euo pipefail

# Configuration
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="274267893613"
ECR_REPO="gpe/services/media-api"
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
HELM_RELEASE="gpe-media-service"
HELM_CHART_PATH="./chart/gpe-media-service"

# Tag components
COMMIT_SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
TIMESTAMP=$(date +%Y%m%d%H%M%S)
ENVIRONMENT="${1:-dev}" # Pass as first argument, default to 'dev'

IMAGE_TAG="${COMMIT_SHA}.${BRANCH}.${TIMESTAMP}.${ENVIRONMENT}"
IMAGE_NAME="${ECR_REPO}"

echo "Using image tag: ${IMAGE_TAG}"

echo "Logging in to AWS ECR..."
aws ecr get-login-password --region "${AWS_REGION}" --profile gpe | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Building Docker image..."
docker build -f Dockerfile -t "${IMAGE_NAME}:${IMAGE_TAG}" .

echo "Tagging Docker image for ECR..."
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${ECR_URL}:${IMAGE_TAG}"

echo "Pushing Docker image to ECR..."
docker push "${ECR_URL}:${IMAGE_TAG}"

echo "Switching kubectl context to docker-desktop..."
kubectl config use-context docker-desktop

echo "Checking if deployment '${HELM_RELEASE}' exists in namespace 'gpe'..."
if kubectl get deployment/${HELM_RELEASE} --namespace gpe > /dev/null 2>&1; then
  echo "Scaling down deployment to 0 replicas..."
  kubectl scale deployment/${HELM_RELEASE} --replicas=0 --namespace gpe

  echo "Waiting for all pods to terminate..."
  kubectl wait --for=delete pod -l app=${HELM_RELEASE} --namespace gpe --timeout=60s
else
  echo "Deployment '${HELM_RELEASE}' not found in namespace 'gpe'. Skipping scale down and pod wait."
fi

echo "Upgrading Helm release..."
helm upgrade --install "${HELM_RELEASE}" "${HELM_CHART_PATH}" --set image.repository="${ECR_URL}" --set image.tag="${IMAGE_TAG}" --namespace gpe -f "${HELM_CHART_PATH}/values.yaml"
echo "Waiting for deployment rollout to complete..."
kubectl rollout status deployment/${HELM_RELEASE} --namespace gpe --timeout=120s

echo "Tailing logs for deployment: ${HELM_RELEASE}"
kubectl logs -f deployment/${HELM_RELEASE} --namespace gpe
echo "Done."
